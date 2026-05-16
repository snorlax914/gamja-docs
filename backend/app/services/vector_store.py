"""Qdrant 벡터 DB 래퍼. 문서별 청크를 저장하고 검색."""
import uuid
from typing import List

from loguru import logger
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.config import settings


class VectorStore:
    def __init__(self):
        self.client = AsyncQdrantClient(
            host=settings.qdrant_host, port=settings.qdrant_port
        )
        self.collection = settings.qdrant_collection

    async def ensure_collection(self, dim: int):
        """컬렉션이 없으면 생성"""
        collections = await self.client.get_collections()
        names = {c.name for c in collections.collections}
        if self.collection not in names:
            logger.info(f"Qdrant 컬렉션 생성: {self.collection} (dim={dim})")
            await self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )

    async def upsert_chunks(
        self,
        doc_id: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadata: dict,
    ):
        """문서의 청크들을 저장"""
        points = []
        for idx, (chunk, vec) in enumerate(zip(chunks, embeddings)):
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vec,
                    payload={
                        "doc_id": doc_id,
                        "chunk_idx": idx,
                        "text": chunk,
                        **metadata,
                    },
                )
            )
        await self.client.upsert(collection_name=self.collection, points=points)
        logger.info(f"문서 {doc_id}: {len(points)}개 청크 저장 완료")

    async def search(
        self, query_vector: List[float], doc_id: str | None = None, top_k: int = 5
    ) -> List[dict]:
        """유사도 검색. doc_id가 주어지면 해당 문서로 제한"""
        query_filter = None
        if doc_id:
            query_filter = Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
            )

        results = await self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            query_filter=query_filter,
            limit=top_k,
        )
        return [
            {"text": r.payload["text"], "score": r.score, "chunk_idx": r.payload.get("chunk_idx")}
            for r in results
        ]

    async def delete_doc(self, doc_id: str):
        """문서의 모든 청크 삭제"""
        await self.client.delete(
            collection_name=self.collection,
            points_selector=Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
            ),
        )


_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
