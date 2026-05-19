# 백엔드 성능 개선 보고서

- 작성일: 2026-05-19
- 대상: gamja-docs 백엔드 (FastAPI + PaddleOCR-VL + Ollama RAG)

---

## 1. PDF 페이지 병렬 OCR 처리

### 변경 전

`ocr.py`의 `_extract_pdf()`에서 PDF의 각 페이지를 **순차적으로** OCR 처리하고 있었다.

```python
for idx, img in enumerate(images, start=1):
    text = self._predict_image(str(img_path))  # 한 페이지씩 대기
```

페이지당 약 5~10초가 소요되므로, 10페이지 PDF 기준 **50~100초**가 걸린다.
각 페이지의 OCR은 서로 독립적인 작업이므로 순차 처리할 이유가 없다.

### 변경 후

`asyncio.gather()`와 `asyncio.Semaphore`를 활용한 **병렬 처리**로 변경했다.

```python
sem = asyncio.Semaphore(MAX_CONCURRENT_PAGES)  # 기본 4

async def _ocr_page(idx, path):
    async with sem:
        text = await asyncio.to_thread(self._predict_image, path)
        return f"## Page {idx}\n\n{text}"

tasks = [_ocr_page(i, p) for i, p in enumerate(img_paths, start=1)]
page_texts = await asyncio.gather(*tasks)
```

- `Semaphore(4)`로 동시에 최대 4페이지까지 병렬 처리
- vLLM 서버의 GPU 메모리 부담을 제한하면서도 처리량 향상
- `MAX_CONCURRENT_PAGES` 값은 GPU 여유에 따라 조정 가능


---

## 2. 청크 결과 캐싱

### 변경 전

`GET /documents/{doc_id}/chunks` 엔드포인트가 호출될 때마다, 디스크에서 전체 OCR 텍스트를 읽고 **매번 처음부터 청킹을 다시 수행**하고 있었다.

```python
md = _read_markdown(doc)    # 파일 읽기
chunks = chunk_text(md)     # 매번 재계산
```

프론트엔드에서 이 API를 반복 호출(페이지 전환, 새로고침 등)하면 동일한 결과에 대해 불필요한 연산이 반복된다.

### 변경 후

**업로드 처리 시점**에서 청크 결과를 `.chunks.json` 파일로 저장하고, 이후 조회 시에는 캐시를 읽는다.

1. `_process_document()`: 청킹 완료 후 결과를 `{doc_id}.chunks.json`으로 저장
2. `GET /chunks`: 캐시 파일이 있으면 바로 반환, 없으면 재청킹 후 캐시 생성 (기존 문서 호환)
3. `DELETE /documents/{doc_id}`: 원본, .txt, .chunks.json 모두 정리

### 기대 효과

- 문서 내용이 변경되지 않으므로 캐시 무효화 이슈 없음
- 기존에 캐시 없이 처리된 문서도 첫 조회 시 자동으로 캐시 생성

---

## 3. Ollama 모델 콜드 스타트 문제 (미적용, 검토 중)

### 현재 문제

Ollama는 LLM 모델(qwen3)을 GPU/RAM에 올려둔 뒤, **기본 5분간 요청이 없으면 메모리에서 내린다.**
이후 첫 요청이 들어오면 모델을 다시 로드하며 **10~30초 지연**이 발생한다.

이는 사용자 경험에 직접적으로 영향을 준다:
- 문서 분류 시 첫 응답 지연
- RAG 질의 시 첫 토큰까지 대기 시간 증가

### 검토 중인 선택지

#### A안: `keep_alive` 시간 연장

Ollama API 호출 시 `keep_alive` 파라미터로 모델 유지 시간을 설정할 수 있다.

```python
json={
    "model": self.model,
    "messages": messages,
    "keep_alive": "30m",  # 30분간 유지
}
```

| 값 | 의미 | 장점 | 단점 |
|----|------|------|------|
| `"5m"` (기본) | 5분 후 해제 | 메모리 절약 | 빈번한 콜드 스타트 |
| `"30m"` | 30분 후 해제 | 대부분의 사용 패턴 커버 | 30분간 GPU 메모리 점유 |
| `"-1"` | 무기한 유지 | 콜드 스타트 완전 제거 | GPU 메모리 상시 점유, 다른 모델 로드 불가 |

현재 서버 환경에서 qwen3 모델이 GPU 메모리의 어느 정도를 차지하는지에 따라 판단이 달라진다.
다른 GPU 작업(PaddleOCR-VL의 vLLM, 임베딩 등)과 메모리를 공유하므로, 무기한 유지(`-1`)는 부담될 수 있다.

**현실적인 선택: `"30m"`이 적절해 보인다.** 일반적인 사용 시나리오에서 문서 업로드 → 분류 → 질의까지 30분 이내에 이루어지기 때문이다.

#### B안: 서버 시작 시 워밍업 호출

FastAPI의 lifespan 이벤트에서 서버 시작 시 Ollama에 짧은 요청을 보내 모델을 미리 로드한다.

```python
@asynccontextmanager
async def lifespan(app):
    llm = get_ollama()
    await llm._chat([{"role": "user", "content": "ping"}])
    yield
    await llm.close()
```

이 방식의 장점은 **서버 시작 직후 첫 사용자 요청부터 빠르게 응답**할 수 있다는 것이다.
단점은 서버가 시작될 때마다 모델 로드 시간이 추가된다는 것이다 (배포/재시작 시 ~30초 추가).

#### 권장 조합

A안과 B안은 상호 배타적이지 않다. 함께 적용하면:

1. 서버 시작 → 워밍업으로 모델 즉시 로드 (B안)
2. 이후 매 요청마다 `keep_alive: "30m"` (A안)
3. 30분간 사용이 없으면 자연스럽게 메모리 해제

이 조합이 **하드웨어 부담과 사용자 경험 사이의 균형점**이다.

### 결정 필요 사항

- [ ] 현재 GPU 메모리 사용량 확인 (qwen3 로드 시 점유량)
- [ ] vLLM(PaddleOCR)과 Ollama(qwen3)가 동시에 GPU에 올라갈 수 있는지 확인
- [ ] `keep_alive` 적정 시간 결정 (팀 논의)
- [ ] 워밍업 호출 추가 여부 결정

---

## 요약

| 항목 | 상태 | 영향도 |
|------|------|--------|
| PDF 병렬 OCR | 적용 완료 | 멀티페이지 PDF 처리 속도 ~3배 향상 |
| 청크 결과 캐싱 | 적용 완료 | `/chunks` 응답 시간 대폭 감소 |
| Ollama 콜드 스타트 | 검토 중 | 첫 응답 지연 10~30초 제거 가능 |
