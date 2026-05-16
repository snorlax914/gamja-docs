from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PaddleOCR-VL (vLLM server)
    paddleocr_vllm_url: str = "http://localhost:8118/v1"

    # poppler (pdf2image용). 비워두면 시스템 PATH에서 찾음.
    poppler_path: str | None = None

    # PaddleOCR 레이아웃 검출 디바이스: "gpu" | "gpu:0" | "cpu"
    # gpu를 쓰려면 paddlepaddle-gpu 가 설치돼 있어야 함.
    paddle_device: str = "gpu"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3"

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "documents"

    # Embedding
    embedding_model: str = "BAAI/bge-m3"  # 한/영 모두 잘함
    embedding_dim: int = 1024

    # RAG
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 5

    # File
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 20


settings = Settings()
