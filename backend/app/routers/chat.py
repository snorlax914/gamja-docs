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

    # 정규화: None 또는 빈 리스트 → 전체. 중복 제거하되 입력 순서 유지.
    selected_ids: list[str] = []
    seen: set[str] = set()
    for did in req.doc_ids or []:
        if did and did not in seen:
            seen.add(did)
            selected_ids.append(did)

    if selected_ids:
        # 다중/단일 모드 — 선택된 문서들 검증
        for did in selected_ids:
            doc = store.get(did)
            if not doc:
                raise HTTPException(404, f"문서를 찾을 수 없습니다: {did}")
            if doc.get("status") != "ready":
                raise HTTPException(
                    400,
                    f"문서가 아직 준비되지 않았습니다 ({did}, status={doc.get('status')})",
                )
        scope_label = f"{len(selected_ids)}docs" if len(selected_ids) > 1 else selected_ids[0]
        search_doc_ids: list[str] | None = selected_ids
        multi_doc_context = len(selected_ids) > 1
    else:
        # 전체 모드
        ready_docs = [d for d in store.list_all() if d.get("status") == "ready"]
        if not ready_docs:
            raise HTTPException(400, "준비된 문서가 없습니다")
        scope_label = f"all({len(ready_docs)})"
        search_doc_ids = None
        multi_doc_context = True

    # doc_id -> filename 매핑 (출처 표시용)
    doc_names = {d["doc_id"]: d.get("filename", "") for d in store.list_all()}

    embedder = get_embedder()
    vector_store = get_vector_store()
    llm = get_ollama()

    # 1. 질문 임베딩 + 검색
    t = time.perf_counter()
    q_vec = await embedder.embed_one(req.question)
    t_embed = time.perf_counter() - t

    t = time.perf_counter()
    hits = await vector_store.search(
        query_vector=q_vec, doc_ids=search_doc_ids, top_k=settings.top_k
    )
    t_search = time.perf_counter() - t
    logger.info(
        f"[chat {scope_label}] 질문 임베딩 {t_embed*1000:.0f}ms, 검색 {t_search*1000:.0f}ms, "
        f"히트 {len(hits)}개"
    )

    if not hits:
        async def empty():
            yield f"event: sources\ndata: []\n\n"
            yield f"event: token\ndata: 문서에서 관련 내용을 찾을 수 없습니다.\n\n"
            yield f"event: done\ndata: {{}}\n\n"
        return StreamingResponse(empty(), media_type="text/event-stream")

    # 검색 결과에 filename 보강 — 다중/전체 모드에서 출처가 어느 문서인지 보여주기 위함
    for h in hits:
        h["filename"] = doc_names.get(h.get("doc_id") or "", "")

    # LLM 에 전달할 컨텍스트 — 여러 문서가 섞일 수 있으면 각 발췌 앞에 문서명을 붙여
    # 답변에서 어느 문서를 근거로 했는지 인용할 수 있게 한다.
    if multi_doc_context:
        contexts = [
            f"[문서: {h['filename'] or h.get('doc_id') or '미상'}]\n{h['text']}"
            for h in hits
        ]
    else:
        contexts = [h["text"] for h in hits]
    logger.info(f"검색 결과: top score={hits[0]['score']:.3f}, n={len(hits)}")

    async def event_stream():
        # 출처 먼저 전송
        sources_payload = json.dumps(
            [
                {
                    "chunk_idx": h["chunk_idx"],
                    "score": h["score"],
                    "text": h["text"],
                    "doc_id": h.get("doc_id"),
                    "filename": h.get("filename"),
                }
                for h in hits
            ],
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
            f"[chat {scope_label}] LLM 답변 완료 — 첫 토큰 {(first_token_at or 0)*1000:.0f}ms, "
            f"총 {total:.2f}s, {n_chunks} chunks"
        )
        yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
