from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.logging_setup import setup_logging
from app.routers import chat, documents
from app.services.embedding import get_embedder
from app.services.vector_store import get_vector_store

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 임베딩 모델 미리 로드 + 컬렉션 보장.
    # 준비 단계가 실패해도 서버는 떠야 한다 — 임베더/컬렉션은 첫 요청 때
    # 지연 초기화되므로 여기서 예외를 삼키고 계속 진행한다.
    # (Qdrant 지연 기동, 모델 로드 실패 등으로 서버가 아예 안 뜨는 것을 방지)
    logger.info("서버 시작 중...")
    try:
        embedder = get_embedder()
        vector_store = get_vector_store()
        await vector_store.ensure_collection(embedder.dim)
        logger.info("서버 준비 완료")
    except Exception as e:
        logger.exception(
            f"시작 준비 실패 — 서버는 계속 띄웁니다 (첫 요청 시 재시도): {e}"
        )
    yield
    logger.info("서버 종료")


app = FastAPI(title="Doc RAG MVP", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP: 모두 허용. 실제 서비스에선 도메인 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chat.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """라우트에서 처리되지 않은 예외를 로그 파일(error.log)에 기록한다.
    시연 중 발생한 서버 오류를 SSH 로 추적하기 위함."""
    logger.exception(f"미처리 예외: {request.method} {request.url.path}")
    return JSONResponse(status_code=500, content={"detail": "서버 내부 오류"})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"name": "Doc RAG MVP", "docs": "/docs"}
