"""loguru 로그 설정 — 콘솔 + 파일 싱크.

외부(SSH)에서 시연 중 서버 오류를 확인할 수 있도록 로그를 파일로도 남긴다.
main.py 에서 import 시 한 번 호출된다.
"""
import asyncio
import logging
import sys
from pathlib import Path

from loguru import logger

# 레포 루트의 logs/ — restart-all.ps1 의 헤드리스 로그와 같은 위치
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"

_configured = False


class _InterceptHandler(logging.Handler):
    """표준 logging(uvicorn 등) 레코드를 loguru 로 넘겨 파일에도 남게 한다."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # 정상 종료·리로드 시 나오는 취소/인터럽트 트레이스백은 오류가 아니므로
        # error.log 를 더럽히지 않도록 DEBUG 로 강등한다.
        exc = record.exc_info
        if (
            exc
            and exc[0] is not None
            and issubclass(exc[0], (KeyboardInterrupt, SystemExit, asyncio.CancelledError))
        ):
            level = "DEBUG"

        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging(level: str = "INFO") -> Path:
    """콘솔 + 파일 로그 싱크를 구성하고 로그 디렉터리를 반환한다."""
    global _configured
    if _configured:
        return LOG_DIR
    _configured = True

    LOG_DIR.mkdir(parents=True, exist_ok=True)

    logger.remove()  # 기본 stderr 싱크 제거 후 재구성

    # 1) 콘솔 — 윈도 모드에서 보던 그대로
    logger.add(sys.stderr, level=level, enqueue=True)

    # 2) 전체 로그 — 날짜별 파일, 10MB 마다 회전, 7일 보관
    logger.add(
        LOG_DIR / "backend_{time:YYYY-MM-DD}.log",
        level=level,
        rotation="10 MB",
        retention="7 days",
        encoding="utf-8",
        enqueue=True,
        backtrace=True,
    )

    # 3) 오류 전용 — 시연 중 오류만 빠르게 확인 (error.log)
    logger.add(
        LOG_DIR / "error.log",
        level="ERROR",
        rotation="5 MB",
        retention="14 days",
        encoding="utf-8",
        enqueue=True,
        backtrace=True,
    )

    # 표준 logging(uvicorn) → loguru 로 라우팅
    logging.basicConfig(handlers=[_InterceptHandler()], level=0, force=True)
    for name in list(logging.root.manager.loggerDict):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True

    logger.info(f"로그 파일 경로: {LOG_DIR}")
    return LOG_DIR
