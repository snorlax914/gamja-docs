# Doc RAG MVP

문서를 업로드하면 OCR로 텍스트를 추출하고, LLM으로 문서 종류를 분류한 뒤,
문서 내용을 기반으로 질문에 답하는 RAG 웹 애플리케이션.

## 스택

| 영역 | 기술 |
|---|---|
| OCR | PaddleOCR-VL (vLLM 서버로 서빙) |
| LLM | Ollama + qwen3 |
| 임베딩 | BGE-M3 (한/영 모두 강함) |
| 벡터 DB | Qdrant |
| 백엔드 | FastAPI + httpx |
| 프론트엔드 | Next.js 15 + Tailwind |

## 아키텍처

```
[Next.js]  ──/api 프록시──▶  [FastAPI]
                                  │
                                  ├──▶ [vLLM: PaddleOCR-VL]   (OCR)
                                  ├──▶ [Ollama: qwen3]        (분류, RAG 생성)
                                  ├──▶ [Sentence-Transformers] (임베딩, 로컬)
                                  └──▶ [Qdrant]               (벡터 검색)
```

## 처리 흐름

1. 사용자가 문서(PDF/이미지) 업로드 → FastAPI가 파일 저장
2. **백그라운드 태스크**:
   - PaddleOCR-VL로 OCR (PDF는 페이지별 이미지로 변환 후 처리)
   - qwen3로 문서 종류 분류 (계약서/영수증/이력서 등)
   - 텍스트를 청크로 분할
   - BGE-M3로 임베딩
   - Qdrant에 저장
3. 사용자 질문 → 질문 임베딩 → 해당 문서 청크에서 top-k 검색 → qwen3로 답변 생성 (SSE 스트리밍)

## 사전 준비

### 1. Qdrant 띄우기 (Docker)

```bash
cd docker
docker compose up -d
```

### 2. Ollama 설치 + qwen3 모델 받기

```bash
# https://ollama.com 에서 설치 후
ollama pull qwen3
ollama serve  # 보통 자동 실행됨, http://localhost:11434
```

### 3. PaddleOCR-VL을 vLLM 서버로 띄우기

vLLM 측 권장 방식 ([공식 가이드](https://docs.vllm.ai/projects/recipes/en/latest/PaddlePaddle/PaddleOCR-VL.html)):

```bash
# vLLM 설치 (nightly 권장)
uv venv && source .venv/bin/activate
uv pip install -U vllm --pre \
  --extra-index-url https://wheels.vllm.ai/nightly \
  --extra-index-url https://download.pytorch.org/whl/cu129 \
  --index-strategy unsafe-best-match

# 서버 기동
vllm serve PaddlePaddle/PaddleOCR-VL \
  --trust-remote-code \
  --served-model-name PaddleOCR-VL-0.9B \
  --max-num-batched-tokens 16384 \
  --no-enable-prefix-caching \
  --mm-processor-cache-gb 0 \
  --port 8080
```

또는 PaddleOCR 공식 도커 이미지 사용:

```bash
docker run --rm --gpus all --network host \
  ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddlex-genai-vllm-server
```

> PDF 처리에는 시스템에 `poppler`가 설치되어 있어야 합니다.
> - macOS: `brew install poppler`
> - Ubuntu: `sudo apt install poppler-utils`

## 백엔드 실행

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 필요 시 값 수정
uvicorn app.main:app --reload --port 8000
```

OpenAPI 문서: http://localhost:8000/docs

## 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

## 주요 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/documents/upload` | 파일 업로드, 처리 시작 |
| GET | `/documents` | 문서 목록 |
| GET | `/documents/{id}` | 문서 상세 (상태/분류 결과 포함) |
| DELETE | `/documents/{id}` | 문서 + 벡터 삭제 |
| POST | `/chat` | RAG 질의 (SSE 스트리밍) |

## 디렉터리 구조

```
doc-rag-mvp/
├── backend/
│   └── app/
│       ├── main.py            # FastAPI entry
│       ├── config.py          # 환경 설정
│       ├── schemas.py         # Pydantic 모델
│       ├── routers/
│       │   ├── documents.py   # 업로드/조회/삭제
│       │   └── chat.py        # RAG 채팅 (SSE)
│       └── services/
│           ├── ocr.py         # PaddleOCR-VL (vLLM client)
│           ├── llm.py         # Ollama (분류 + 답변)
│           ├── embedding.py   # BGE-M3
│           ├── vector_store.py # Qdrant
│           ├── chunker.py     # 텍스트 청킹
│           └── doc_store.py   # 문서 메타데이터 (JSON)
├── frontend/
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── UploadZone.tsx
│   │   ├── DocList.tsx
│   │   ├── DocDetail.tsx
│   │   └── ChatPanel.tsx      # SSE 스트리밍 클라이언트
│   └── lib/api.ts             # API client + SSE 파서
└── docker/
    └── docker-compose.yml     # Qdrant
```

## 확장 아이디어

- **여러 문서 동시 검색**: `chat.py`에서 `doc_id` 필터를 제거하거나 다중 선택 지원
- **메타데이터 필터**: 분류 결과(`category_code`)로 검색 범위 제한
- **재순위(rerank)**: BGE-reranker로 top-k 재정렬해서 정확도 향상
- **하이브리드 검색**: Qdrant의 sparse 벡터(BM25) + dense 결합
- **인증**: 세션/JWT 추가 후 사용자별 문서 격리
- **DB**: 현재 JSON 파일인 `doc_store`를 PostgreSQL로 교체
