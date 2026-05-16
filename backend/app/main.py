from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.routers import chat, documents
from app.services.embedding import get_embedder
from app.services.vector_store import get_vector_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작 시 임베딩 모델 미리 로드 + 컬렉션 보장
    logger.info("서버 시작 중...")
    embedder = get_embedder()
    vector_store = get_vector_store()
    await vector_store.ensure_collection(embedder.dim)
    logger.info("서버 준비 완료")
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


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"name": "Doc RAG MVP", "docs": "/docs"}
