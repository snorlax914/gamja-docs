"""
PaddleOCR-VL을 vLLM 서버로 호출해서 문서 OCR 수행.
PDF는 pdf2image로 페이지별 이미지로 변환 후 병렬 처리.
"""
import asyncio
import tempfile
import time
from pathlib import Path
from typing import List

from loguru import logger
from paddleocr import PaddleOCRVL
from pdf2image import convert_from_path
from PIL import Image

from app.config import settings

# vLLM 서버에 동시에 보내는 최대 페이지 수 (GPU 메모리 보호)
MAX_CONCURRENT_PAGES = 4


class OCRService:
    def __init__(self):
        # vllm-server 모드로 PaddleOCR-VL 초기화 (페이지 단위 파싱)
        # 레이아웃 검출(PP-DocLayoutV2)은 device 로 지정 — VL 인식은 vLLM 서버가 담당
        t = time.perf_counter()
        logger.info(
            f"PaddleOCR-VL 파이프라인 초기화 중... (레이아웃 검출 device={settings.paddle_device}, "
            "첫 실행 시 레이아웃 모델 다운로드)"
        )
        self.pipeline = PaddleOCRVL(
            vl_rec_backend="vllm-server",
            vl_rec_server_url=settings.paddleocr_vllm_url,
            device=settings.paddle_device,
        )
        logger.info(f"PaddleOCR-VL 파이프라인 준비 완료 ({time.perf_counter() - t:.2f}s)")

    def _predict_image(self, image_path: str) -> str:
        """단일 이미지 OCR → markdown 텍스트 반환"""
        output = self.pipeline.predict(image_path)
        markdown_parts: List[str] = []
        for res in output:
            md = res.markdown.get("markdown_texts", "") if hasattr(res, "markdown") else ""
            if md:
                markdown_parts.append(md)
        return "\n\n".join(markdown_parts)

    async def extract_text(self, file_path: str) -> str:
        """PDF 또는 이미지 파일에서 텍스트 추출. 동기 작업은 thread로 위임."""
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            return await self._extract_pdf_parallel(file_path)
        elif suffix in {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}:
            return await asyncio.to_thread(self._predict_image, file_path)
        else:
            raise ValueError(f"지원하지 않는 파일 형식: {suffix}")

    async def _extract_pdf_parallel(self, pdf_path: str) -> str:
        """PDF → 페이지별 이미지 → 병렬 OCR"""
        logger.info(f"PDF OCR 시작 (병렬, 최대 {MAX_CONCURRENT_PAGES}개 동시): {pdf_path}")
        with tempfile.TemporaryDirectory() as tmpdir:
            t = time.perf_counter()
            images = await asyncio.to_thread(
                convert_from_path,
                pdf_path,
                dpi=200,
                output_folder=tmpdir,
                fmt="png",
                poppler_path=settings.poppler_path or None,
            )
            logger.info(
                f"  PDF→이미지 변환 완료: {len(images)}페이지 ({time.perf_counter() - t:.2f}s)"
            )

            # 페이지 이미지를 먼저 모두 저장
            img_paths: List[str] = []
            for idx, img in enumerate(images, start=1):
                img_path = Path(tmpdir) / f"page_{idx}.png"
                img.save(img_path, "PNG")
                img_paths.append(str(img_path))

            # Semaphore로 동시 요청 수 제한하며 병렬 OCR
            sem = asyncio.Semaphore(MAX_CONCURRENT_PAGES)

            async def _ocr_page(idx: int, path: str) -> str:
                async with sem:
                    t_page = time.perf_counter()
                    logger.info(f"  페이지 {idx}/{len(images)} OCR 중...")
                    text = await asyncio.to_thread(self._predict_image, path)
                    logger.info(
                        f"  페이지 {idx}/{len(images)} 완료 "
                        f"({time.perf_counter() - t_page:.2f}s, {len(text):,}자)"
                    )
                    return f"## Page {idx}\n\n{text}"

            tasks = [_ocr_page(i, p) for i, p in enumerate(img_paths, start=1)]
            page_texts = await asyncio.gather(*tasks)

            total = time.perf_counter() - t
            logger.info(f"  PDF 전체 OCR 완료: {len(images)}페이지 ({total:.2f}s)")
            return "\n\n---\n\n".join(page_texts)


# 싱글톤
_ocr_service: OCRService | None = None


def get_ocr_service() -> OCRService:
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
