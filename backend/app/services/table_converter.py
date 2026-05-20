"""OCR 출력에 섞여 나오는 HTML 표(`<table>`)를 GitHub-Flavored Markdown 표로 변환.

PaddleOCR-VL은 본문은 마크다운으로 출력하지만 표는 종종 `<table><tr><td>...` 형태의
HTML 단편을 그대로 내보낸다. 이 모듈은 그 단편들을 찾아 마크다운 파이프 표로 치환해
후속 청커가 표를 `|...|` 라인 묶음으로 인식하고 한 청크에 묶어 보존할 수 있게 한다.

규칙:
- `<thead>` 가 있으면 헤더 행으로 사용. 없고 첫 행에 `<th>` 가 있으면 그 행이 헤더.
  둘 다 없으면 첫 행을 헤더로 승격(GFM 표는 헤더 행이 필수).
- `rowspan` / `colspan` 은 같은 셀 값을 펼쳐 채워 단순 격자로 평탄화.
- 셀 안의 `<br>` 은 공백으로, 그 외 인라인 태그는 텍스트만 추출.
- 셀에 들어간 `|` 와 개행은 각각 `\\|`, 공백으로 이스케이프.
"""
from __future__ import annotations

import re
from typing import List

from bs4 import BeautifulSoup, NavigableString, Tag


_TABLE_RE = re.compile(r"<table\b[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL)


def html_tables_to_markdown(text: str) -> str:
    """입력 텍스트에 포함된 모든 `<table>...</table>` 단편을 마크다운 표로 치환."""
    if "<table" not in text.lower():
        return text

    def _replace(match: re.Match[str]) -> str:
        try:
            md = _convert_one(match.group(0))
        except Exception:
            # 변환 실패 시 원문 유지 — 검색은 떨어져도 정보 손실은 막는다.
            return match.group(0)
        return "\n\n" + md + "\n\n" if md else match.group(0)

    return _TABLE_RE.sub(_replace, text)


def _convert_one(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        return ""

    rows = _extract_rows(table)
    if not rows:
        return ""

    grid, header_idx = _flatten_spans(rows)
    if not grid:
        return ""

    if header_idx is None:
        header_idx = 0  # GFM 표는 헤더가 필수 — 첫 행을 헤더로 승격

    width = max(len(r) for r in grid)
    grid = [r + [""] * (width - len(r)) for r in grid]

    header = grid[header_idx]
    body = [r for i, r in enumerate(grid) if i != header_idx]

    lines: List[str] = []
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "|".join(["---"] * width) + "|")
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _extract_rows(table: Tag) -> List[dict]:
    """`<table>` 에서 행 단위로 (셀 리스트, 헤더 여부) 를 뽑는다.

    `<thead>` 내부 행, 또는 모든 셀이 `<th>` 인 행을 헤더로 간주한다.
    """
    rows: List[dict] = []
    thead = table.find("thead")
    thead_rows = set(id(r) for r in thead.find_all("tr")) if thead else set()

    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"], recursive=False)
        if not cells:
            continue
        parsed = []
        for c in cells:
            parsed.append(
                {
                    "text": _cell_text(c),
                    "rowspan": _int_attr(c, "rowspan", 1),
                    "colspan": _int_attr(c, "colspan", 1),
                }
            )
        is_header = id(tr) in thead_rows or all(c.name == "th" for c in cells)
        rows.append({"cells": parsed, "is_header": is_header})
    return rows


def _flatten_spans(rows: List[dict]) -> tuple[List[List[str]], int | None]:
    """rowspan/colspan 을 풀어 직사각형 격자로 변환. 헤더 행 인덱스도 함께 반환."""
    grid: List[List[str]] = []
    header_idx: int | None = None
    # row_idx -> col_idx -> 채워둘 텍스트 (rowspan 잔여)
    pending: dict[int, dict[int, str]] = {}

    for r_idx, row in enumerate(rows):
        out: List[str] = []
        col = 0
        carry = pending.pop(r_idx, {})
        for cell in row["cells"]:
            # 앞쪽에 rowspan 으로 예약된 칸이 있으면 먼저 채운다
            while col in carry:
                out.append(carry.pop(col))
                col += 1
            text = cell["text"]
            for _ in range(cell["colspan"]):
                out.append(text)
                if cell["rowspan"] > 1:
                    for future in range(1, cell["rowspan"]):
                        pending.setdefault(r_idx + future, {})[col] = text
                col += 1
        # 행 끝에 남은 carry 처리
        while col in carry:
            out.append(carry.pop(col))
            col += 1
        grid.append(out)
        if row["is_header"] and header_idx is None:
            header_idx = r_idx
    return grid, header_idx


def _cell_text(cell: Tag) -> str:
    """셀 내부 텍스트를 표 한 칸에 들어갈 수 있는 형태로 정규화."""
    parts: List[str] = []
    for node in cell.descendants:
        if isinstance(node, NavigableString):
            parts.append(str(node))
        elif isinstance(node, Tag) and node.name == "br":
            parts.append(" ")
    text = "".join(parts)
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace("|", r"\|")


def _int_attr(tag: Tag, name: str, default: int) -> int:
    raw = tag.get(name)
    if raw is None:
        return default
    try:
        v = int(str(raw).strip())
        return v if v > 0 else default
    except ValueError:
        return default
