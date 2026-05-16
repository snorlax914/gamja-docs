"""RAG 질의 응답 API. 답변은 SSE로 스트리밍."""
import json
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger

from app.config import settings
from app.schemas import ChatRequest
from app.services.doc_store import get_doc_store
from app.services.embedding import get_embedder
from app.services.llm import get_ollama
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("")
async def chat(req: ChatRequest):
    store = get_doc_store()
    doc = store.get(req.doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다")
    if doc.get("status") != "ready":
        raise HTTPException(
            400, f"문서가 아직 준비되지 않았습니다 (status={doc.get('status')})"
        )

    embedder = get_embedder()
    vector_store = get_vector_store()
    llm = get_ollama()

    # 1. 질문 임베딩 + 검색
    t = time.perf_counter()
    q_vec = await embedder.embed_one(req.question)
    t_embed = time.perf_counter() - t

    t = time.perf_counter()
    hits = await vector_store.search(
        query_vector=q_vec, doc_id=req.doc_id, top_k=settings.top_k
    )
    t_search = time.perf_counter() - t
    logger.info(
        f"[chat {req.doc_id}] 질문 임베딩 {t_embed*1000:.0f}ms, 검색 {t_search*1000:.0f}ms, "
        f"히트 {len(hits)}개"
    )

    if not hits:
        async def empty():
            yield f"event: sources\ndata: []\n\n"
            yield f"event: token\ndata: 문서에서 관련 내용을 찾을 수 없습니다.\n\n"
            yield f"event: done\ndata: {{}}\n\n"
        return StreamingResponse(empty(), media_type="text/event-stream")

    contexts = [h["text"] for h in hits]
    logger.info(f"검색 결과: top score={hits[0]['score']:.3f}, n={len(hits)}")

    async def event_stream():
        # 출처 먼저 전송
        sources_payload = json.dumps(
            [{"chunk_idx": h["chunk_idx"], "score": h["score"], "text": h["text"]} for h in hits],
            ensure_ascii=False,
        )
        yield f"event: sources\ndata: {sources_payload}\n\n"

        # 토큰 스트리밍
        t0 = time.perf_counter()
        first_token_at: float | None = None
        n_chunks = 0
        try:
            async for token in llm.rag_answer_stream(req.question, contexts):
                if first_token_at is None:
                    first_token_at = time.perf_counter() - t0
                n_chunks += 1
                # SSE는 줄바꿈에 민감 → JSON으로 감싸 전송
                yield f"event: token\ndata: {json.dumps({'t': token}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("스트리밍 중 오류")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            return

        total = time.perf_counter() - t0
        logger.info(
            f"[chat {req.doc_id}] LLM 답변 완료 — 첫 토큰 {(first_token_at or 0)*1000:.0f}ms, "
            f"총 {total:.2f}s, {n_chunks} chunks"
        )
        yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
