from typing import Optional

from pydantic import BaseModel


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    status: str  # "processing" | "ready" | "error"


class Classification(BaseModel):
    category: str
    category_code: str
    confidence: float
    reason: Optional[str] = ""


class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    status: str
    created_at: str
    classification: Optional[Classification] = None
    text_preview: Optional[str] = None
    full_text_length: Optional[int] = None
    chunk_count: Optional[int] = None
    error: Optional[str] = None


class ChatRequest(BaseModel):
    doc_id: str
    question: str


class SearchHit(BaseModel):
    text: str
    score: float
    chunk_idx: Optional[int] = None


class ChunkInfo(BaseModel):
    idx: int
    text: str
    length: int


class MarkdownResponse(BaseModel):
    doc_id: str
    markdown: str
    length: int


class ChunksResponse(BaseModel):
    doc_id: str
    count: int
    chunk_size: int
    chunk_overlap: int
    chunks: list[ChunkInfo]
