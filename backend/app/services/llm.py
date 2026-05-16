"""Ollama HTTP API 호출. 문서 분류 + RAG 답변 생성."""
import json
from typing import AsyncIterator, List

import httpx
from loguru import logger

from app.config import settings


CLASSIFY_PROMPT = """당신은 문서 분류 전문가입니다. 아래 문서 내용을 보고 어떤 종류의 문서인지 분류하세요.

가능한 카테고리:
- 계약서 (contract)
- 영수증 (receipt)
- 세금계산서 (tax_invoice)
- 신분증 (id_card)
- 이력서 (resume)
- 보고서 (report)
- 학술논문 (academic_paper)
- 매뉴얼 (manual)
- 편지/공문 (letter)
- 기타 (other)

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명은 절대 추가하지 마세요.
{{"category": "<카테고리명>", "category_code": "<영문코드>", "confidence": <0.0~1.0>, "reason": "<한 줄 이유>"}}

문서 내용:
\"\"\"
{text}
\"\"\"
"""


RAG_SYSTEM_PROMPT = """당신은 업로드된 문서를 기반으로 질문에 답하는 어시스턴트입니다.
아래 '문서 컨텍스트'에 있는 내용만을 근거로 답하세요.
컨텍스트에 답이 없으면 "문서에서 해당 내용을 찾을 수 없습니다"라고 답하세요.
추측하지 말고, 가능하면 컨텍스트의 어느 부분을 참조했는지 간단히 인용하세요."""


class OllamaService:
    def __init__(self):
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model
        self.client = httpx.AsyncClient(timeout=120.0)

    async def _chat(self, messages: list[dict], stream: bool = False) -> str:
        """비스트림 chat 호출"""
        resp = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0.2},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]

    async def classify(self, text: str) -> dict:
        """문서 종류 분류. 너무 길면 앞쪽 일부만 사용."""
        snippet = text[:3000]
        prompt = CLASSIFY_PROMPT.format(text=snippet)
        content = await self._chat([{"role": "user", "content": prompt}])

        # qwen3는 <think>...</think> 태그를 붙일 수 있어서 제거
        if "<think>" in content and "</think>" in content:
            content = content.split("</think>", 1)[1].strip()

        # JSON 추출
        try:
            start = content.index("{")
            end = content.rindex("}") + 1
            return json.loads(content[start:end])
        except (ValueError, json.JSONDecodeError) as e:
            logger.warning(f"분류 결과 파싱 실패: {e}, content={content!r}")
            return {
                "category": "기타",
                "category_code": "other",
                "confidence": 0.0,
                "reason": "분류 실패",
            }

    async def rag_answer_stream(
        self, question: str, contexts: List[str]
    ) -> AsyncIterator[str]:
        """RAG 답변을 스트리밍으로 생성"""
        context_block = "\n\n---\n\n".join(
            f"[발췌 {i+1}]\n{c}" for i, c in enumerate(contexts)
        )
        user_prompt = f"""# 문서 컨텍스트
{context_block}

# 질문
{question}

위 컨텍스트를 근거로 답하세요."""

        messages = [
            {"role": "system", "content": RAG_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": True,
                "options": {"temperature": 0.3},
            },
            timeout=None,
        ) as resp:
            resp.raise_for_status()
            in_think = False
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                token = chunk.get("message", {}).get("content", "")
                if not token:
                    if chunk.get("done"):
                        break
                    continue

                # qwen3 thinking 태그는 사용자에게 노출 안 함
                if "<think>" in token:
                    in_think = True
                    token = token.split("<think>", 1)[0]
                if "</think>" in token:
                    in_think = False
                    token = token.split("</think>", 1)[1]
                    if token:
                        yield token
                    continue
                if in_think:
                    continue
                if token:
                    yield token

    async def close(self):
        await self.client.aclose()


_ollama: OllamaService | None = None


def get_ollama() -> OllamaService:
    global _ollama
    if _ollama is None:
        _ollama = OllamaService()
    return _ollama
