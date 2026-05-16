"""문서 메타데이터를 JSON 파일로 영속화하는 간단한 저장소.
실제 운영에선 DB로 교체하면 됨."""
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import settings


class DocStore:
    def __init__(self):
        self.path = Path(settings.upload_dir) / "_docs.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self):
        if self.path.exists():
            self._data = json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self):
        self.path.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def add(self, doc_id: str, **fields):
        self._data[doc_id] = {
            "doc_id": doc_id,
            "created_at": datetime.utcnow().isoformat(),
            **fields,
        }
        self._save()

    def update(self, doc_id: str, **fields):
        if doc_id in self._data:
            self._data[doc_id].update(fields)
            self._save()

    def get(self, doc_id: str) -> dict | None:
        return self._data.get(doc_id)

    def list_all(self) -> list[dict]:
        return sorted(
            self._data.values(), key=lambda d: d.get("created_at", ""), reverse=True
        )

    def delete(self, doc_id: str):
        self._data.pop(doc_id, None)
        self._save()


_store: DocStore | None = None


def get_doc_store() -> DocStore:
    global _store
    if _store is None:
        _store = DocStore()
    return _store
