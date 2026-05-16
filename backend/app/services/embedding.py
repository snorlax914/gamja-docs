"""Sentence-Transformers 기반 임베딩. BGE-M3는 한/영 모두 강함."""
import asyncio
from typing import List

from loguru import logger
from sentence_transformers import SentenceTransformer

from app.config import settings


class EmbeddingService:
    def __init__(self):
        logger.info(f"임베딩 모델 로딩: {settings.embedding_model}")
        # GPU는 vLLM/Ollama가 쓰므로 임베딩은 CPU 고정 (BGE-M3는 CPU에서도 충분히 빠름)
        self.model = SentenceTransformer(settings.embedding_model, device="cpu")
        self.dim = self.model.get_sentence_embedding_dimension()
        logger.info(f"임베딩 차원: {self.dim}")

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """텍스트 리스트 → 벡터 리스트 (스레드로 위임)"""
        def _run():
            return self.model.encode(
                texts, normalize_embeddings=True, show_progress_bar=False
            ).tolist()
        return await asyncio.to_thread(_run)

    async def embed_one(self, text: str) -> List[float]:
        vecs = await self.embed([text])
        return vecs[0]


_embedder: EmbeddingService | None = None


def get_embedder() -> EmbeddingService:
    global _embedder
    if _embedder is None:
        _embedder = EmbeddingService()
    return _embedder
