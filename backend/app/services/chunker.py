"""마크다운 구조를 인지하는 청킹.

PaddleOCR-VL 출력은 ATX 헤더(#, ##, ###), 표, 코드 블록을 포함한 마크다운이다.
4주차의 단순 문단 분할 청커는 표/코드 블록을 가운데서 잘라 검색 품질을 떨어뜨렸기 때문에,
5주차에서는 다음 규칙으로 동작하는 헤더 기반 청커로 교체했다:

1. ATX 헤더(`#`~`######`)를 절(section) 경계로 사용하고, 각 청크 앞에 상위 헤더 경로를 보존한다.
2. 코드 블록(```)과 표(`|...|` 라인 묶음)는 절대 가운데서 자르지 않는다.
3. 한 절이 chunk_size 보다 크면 빈 줄 단위로 다시 자르고, 그래도 크면 문장 분할로 폴백한다.
4. 인접 청크 사이에는 chunk_overlap 만큼 꼬리 텍스트를 공유해 문맥 누락을 줄인다.
"""
from __future__ import annotations

import re
from typing import List

from app.config import settings


HEADER_RE = re.compile(r"^(#{1,6})\s+(.*)$")
TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> List[str]:
    """마크다운 인지 청킹의 진입점."""
    chunk_size = chunk_size or settings.chunk_size
    overlap = overlap or settings.chunk_overlap

    blocks = _split_into_blocks(text)
    sections = _group_by_heading(blocks)

    chunks: List[str] = []
    for header_path, body in sections:
        prefix = ("\n".join(header_path) + "\n\n") if header_path else ""
        budget = max(chunk_size - len(prefix), chunk_size // 2)

        if len(body) <= chunk_size:
            chunks.append((prefix + body).strip())
            continue

        for piece in _split_section(body, budget, overlap):
            chunks.append((prefix + piece).strip())

    return [c for c in chunks if c.strip()]


def _split_into_blocks(text: str) -> List[dict]:
    """원문을 (type, content) 블록으로 토큰화.

    type ∈ {"header", "code", "table", "para"}
    코드/표는 한 덩어리로 묶어 절대 잘리지 않게 표시한다.
    """
    lines = text.splitlines()
    blocks: List[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # 코드 펜스
        if line.lstrip().startswith("```"):
            buf = [line]
            i += 1
            while i < len(lines):
                buf.append(lines[i])
                if lines[i].lstrip().startswith("```"):
                    i += 1
                    break
                i += 1
            blocks.append({"type": "code", "content": "\n".join(buf), "atomic": True})
            continue

        # 헤더
        m = HEADER_RE.match(line)
        if m:
            blocks.append(
                {
                    "type": "header",
                    "level": len(m.group(1)),
                    "content": line.rstrip(),
                    "atomic": True,
                }
            )
            i += 1
            continue

        # 표 (연속된 | ... | 라인)
        if TABLE_ROW_RE.match(line):
            buf = [line]
            i += 1
            while i < len(lines) and TABLE_ROW_RE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            blocks.append({"type": "table", "content": "\n".join(buf), "atomic": True})
            continue

        # 빈 줄 — 스킵 (문단 경계로만 사용)
        if not line.strip():
            i += 1
            continue

        # 문단: 다음 빈 줄/헤더/표/코드 펜스 직전까지
        buf = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if not nxt.strip():
                break
            if HEADER_RE.match(nxt) or TABLE_ROW_RE.match(nxt) or nxt.lstrip().startswith("```"):
                break
            buf.append(nxt)
            i += 1
        blocks.append({"type": "para", "content": "\n".join(buf), "atomic": False})

    return blocks


def _group_by_heading(blocks: List[dict]) -> List[tuple[List[str], str]]:
    """블록 시퀀스를 (헤더 경로, 본문) 절 단위로 묶는다.

    헤더 경로는 현재 절의 상위 헤더 체인이며, 청크 앞에 붙여 검색 시 맥락을 보존한다.
    예: ['# 계약서', '## 제 2 조 (목적)'] + body
    """
    sections: List[tuple[List[str], str]] = []
    header_stack: List[tuple[int, str]] = []  # (level, line)
    body_buf: List[str] = []

    def flush():
        if not body_buf:
            return
        path = [h for _, h in header_stack]
        sections.append((path[:], "\n\n".join(body_buf).strip()))
        body_buf.clear()

    for b in blocks:
        if b["type"] == "header":
            flush()
            lvl = b["level"]
            while header_stack and header_stack[-1][0] >= lvl:
                header_stack.pop()
            header_stack.append((lvl, b["content"]))
        else:
            body_buf.append(b["content"])

    flush()
    # 헤더만 있고 본문이 없는 케이스 보정
    if not sections and header_stack:
        sections.append(([h for _, h in header_stack], ""))
    return sections


def _split_section(body: str, chunk_size: int, overlap: int) -> List[str]:
    """헤더 안의 긴 본문을 빈 줄 → 문장 순으로 잘게 자른다."""
    paragraphs = [p for p in body.split("\n\n") if p.strip()]
    chunks: List[str] = []
    buf = ""

    def push_buf():
        nonlocal buf
        if buf.strip():
            chunks.append(buf.strip())
            tail = buf[-overlap:] if overlap and len(buf) > overlap else ""
            buf = tail

    for para in paragraphs:
        if len(para) > chunk_size:
            push_buf()
            for sent in _split_sentences(para):
                if len(buf) + len(sent) + 1 > chunk_size and buf:
                    push_buf()
                buf += (" " if buf else "") + sent
        else:
            if len(buf) + len(para) + 2 > chunk_size and buf:
                push_buf()
            buf += ("\n\n" if buf else "") + para

    if buf.strip():
        chunks.append(buf.strip())

    # 최후의 하드컷
    final: List[str] = []
    for c in chunks:
        if len(c) <= chunk_size * 1.5:
            final.append(c)
        else:
            step = max(chunk_size - overlap, 1)
            for i in range(0, len(c), step):
                final.append(c[i : i + chunk_size])
    return final


def _split_sentences(text: str) -> List[str]:
    """한/영 혼용 문장 분리. 마침표/물음표/느낌표 + 한국어 종결 어미 후 공백 기준."""
    parts = re.split(r"(?<=[.!?。!?])\s+|(?<=[다요죠습])\s+", text)
    return [p.strip() for p in parts if p.strip()]
