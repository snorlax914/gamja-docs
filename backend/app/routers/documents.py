"""문서 업로드/조회 API.

업로드 흐름:
1. 파일 저장
2. 백그라운드 태스크로 OCR → 분류 → 청킹 → 임베딩 → 벡터DB 저장
3. 상태는 doc_store에서 관리
"""
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from loguru import logger

from app.config import settings
from app.schemas import (
    ChunkInfo,
    ChunksResponse,
    DocumentInfo,
    MarkdownResponse,
    UploadResponse,
)
from app.services.chunker import chunk_text
from app.services.doc_store import get_doc_store
from app.services.embedding import get_embedder
from app.services.llm import get_ollama
from app.services.ocr import get_ocr_service
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}


async def _process_document(doc_id: str, file_path: str):
    """백그라운드: OCR → 분류 → 청킹 → 임베딩 → 저장. 각 단계 소요시간 로깅."""
    store = get_doc_store()
    timings: dict[str, float] = {}
    t_start = time.perf_counter()
    try:
        # 1. OCR
        t = time.perf_counter()
        logger.info(f"[{doc_id}] ▶ OCR 시작")
        ocr = get_ocr_service()
        text = await ocr.extract_text(file_path)
        timings["ocr"] = time.perf_counter() - t
        logger.info(f"[{doc_id}] ✔ OCR 완료 ({timings['ocr']:.2f}s, {len(text):,}자)")
        if not text.strip():
            raise ValueError("OCR 결과가 비어 있습니다")

        store.update(
            doc_id,
            status="classifying",
            text_preview=text[:500],
            full_text_length=len(text),
        )

        # 텍스트 원본은 별도 파일로 저장
        Path(file_path).with_suffix(".txt").write_text(text, encoding="utf-8")

        # 2. 분류
        t = time.perf_counter()
        logger.info(f"[{doc_id}] ▶ 분류 시작")
        llm = get_ollama()
        classification = await llm.classify(text)
        timings["classify"] = time.perf_counter() - t
        logger.info(
            f"[{doc_id}] ✔ 분류 완료 ({timings['classify']:.2f}s) → "
            f"{classification.get('category', '?')}"
        )
        store.update(doc_id, classification=classification, status="indexing")

        # 3. 청킹 + 캐시 저장
        t = time.perf_counter()
        chunks = chunk_text(text)
        timings["chunk"] = time.perf_counter() - t
        logger.info(
            f"[{doc_id}] ✔ 청킹 완료 ({timings['chunk']:.3f}s, {len(chunks)}개 청크)"
        )

        # 청크 결과를 JSON으로 캐시 (재청킹 방지)
        import json as _json
        chunks_cache_path = Path(file_path).with_suffix(".chunks.json")
        chunks_cache_path.write_text(
            _json.dumps(chunks, ensure_ascii=False), encoding="utf-8"
        )

        # 4. 임베딩
        embedder = get_embedder()
        vector_store = get_vector_store()
        await vector_store.ensure_collection(embedder.dim)

        t = time.perf_counter()
        logger.info(f"[{doc_id}] ▶ 임베딩 시작 ({len(chunks)}개 청크)")
        embeddings = await embedder.embed(chunks)
        timings["embed"] = time.perf_counter() - t
        logger.info(f"[{doc_id}] ✔ 임베딩 완료 ({timings['embed']:.2f}s)")

        # 5. 저장
        t = time.perf_counter()
        await vector_store.upsert_chunks(
            doc_id=doc_id,
            chunks=chunks,
            embeddings=embeddings,
            metadata={
                "category": classification.get("category", "기타"),
                "category_code": classification.get("category_code", "other"),
            },
        )
        timings["upsert"] = time.perf_counter() - t
        logger.info(f"[{doc_id}] ✔ 벡터 저장 완료 ({timings['upsert']:.2f}s)")

        store.update(doc_id, status="ready", chunk_count=len(chunks))
        total = time.perf_counter() - t_start
        breakdown = "  ".join(f"{k}={v:.2f}s" for k, v in timings.items())
        logger.info(f"[{doc_id}] ✅ 처리 완료 — 총 {total:.2f}s  ({breakdown})")

    except Exception as e:
        elapsed = time.perf_counter() - t_start
        logger.exception(f"[{doc_id}] ❌ 처리 실패 ({elapsed:.2f}s 경과): {e}")
        store.update(doc_id, status="error", error=str(e))


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
):
    # 확장자 확인
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(400, f"지원 형식: {', '.join(sorted(ALLOWED_EXT))}")

    # 사이즈 확인 (chunk로 읽으며 체크)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    doc_id = uuid.uuid4().hex[:12]
    save_path = upload_dir / f"{doc_id}{suffix}"

    max_bytes = settings.max_file_size_mb * 1024 * 1024
    total = 0
    with save_path.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > max_bytes:
                save_path.unlink(missing_ok=True)
                raise HTTPException(
                    413, f"파일이 너무 큽니다 (최대 {settings.max_file_size_mb}MB)"
                )
            f.write(chunk)

    # 메타 등록
    store = get_doc_store()
    store.add(
        doc_id,
        filename=file.filename,
        file_path=str(save_path),
        status="processing",
    )

    # 백그라운드 처리 시작
    background_tasks.add_task(_process_document, doc_id, str(save_path))

    return UploadResponse(
        doc_id=doc_id, filename=file.filename or "", status="processing"
    )


@router.get("", response_model=list[DocumentInfo])
async def list_documents():
    store = get_doc_store()
    return [DocumentInfo(**d) for d in store.list_all()]


@router.get("/{doc_id}", response_model=DocumentInfo)
async def get_document(doc_id: str):
    store = get_doc_store()
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다")
    return DocumentInfo(**doc)


def _read_markdown(doc: dict) -> str:
    """업로드 시 함께 저장해둔 .txt 에서 OCR 마크다운 원문을 읽는다."""
    fp = Path(doc.get("file_path", ""))
    txt_path = fp.with_suffix(".txt")
    if not txt_path.exists():
        raise HTTPException(409, "OCR이 아직 끝나지 않았거나 원문이 삭제되었습니다")
    return txt_path.read_text(encoding="utf-8")


@router.get("/{doc_id}/markdown", response_model=MarkdownResponse)
async def get_document_markdown(doc_id: str):
    """OCR이 생성한 전체 마크다운 원문을 반환."""
    store = get_doc_store()
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다")
    md = _read_markdown(doc)
    return MarkdownResponse(doc_id=doc_id, markdown=md, length=len(md))


@router.get("/{doc_id}/chunks", response_model=ChunksResponse)
async def get_document_chunks(doc_id: str):
    """캐시된 청크 결과를 반환. 캐시가 없으면 재청킹 후 캐시 생성."""
    store = get_doc_store()
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다")

    import json as _json

    # 캐시 파일 확인
    fp = Path(doc.get("file_path", ""))
    cache_path = fp.with_suffix(".chunks.json")
    if cache_path.exists():
        chunks = _json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        # 캐시 없으면 재청킹 후 캐시 저장 (기존 문서 호환)
        md = _read_markdown(doc)
        chunks = chunk_text(md)
        cache_path.write_text(
            _json.dumps(chunks, ensure_ascii=False), encoding="utf-8"
        )

    return ChunksResponse(
        doc_id=doc_id,
        count=len(chunks),
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        chunks=[ChunkInfo(idx=i, text=c, length=len(c)) for i, c in enumerate(chunks)],
    )


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    store = get_doc_store()
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다")

    # 파일 삭제 (원본 + OCR 텍스트 + 청크 캐시)
    fp = Path(doc.get("file_path", ""))
    for p in [fp, fp.with_suffix(".txt"), fp.with_suffix(".chunks.json")]:
        if p.exists():
            p.unlink()

    # 벡터 삭제
    vector_store = get_vector_store()
    try:
        await vector_store.delete_doc(doc_id)
    except Exception as e:
        logger.warning(f"벡터 삭제 실패: {e}")

    store.delete(doc_id)
    return {"deleted": doc_id}
