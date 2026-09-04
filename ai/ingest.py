"""발표자료(PDF/PPTX) -> 슬라이드 단위 청크 JSONL.

청크 단위를 '슬라이드'로 고정한 이유:
Ready-Q가 발표자에게 내놓는 산출물이 '키워드 + 슬라이드 출처'다.
인용 단위가 곧 슬라이드이므로, 그보다 잘게 쪼개면 검색은 나아질지 몰라도
"몇 번 슬라이드" 를 되돌려줄 수 없게 된다. 검색 단위 = 인용 단위.

사용:
    python ingest.py <파일.pdf|파일.pptx> [-o data/chunks.jsonl]

종료 코드: 0 정상 / 1 파일 없음 / 3 추출 실패(텍스트 0건)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from pptx.enum.shapes import MSO_SHAPE_TYPE


class NoTextError(RuntimeError):
    """추출 가능한 텍스트가 전혀 없는 자료. 조용히 0건으로 넘기면 안 된다."""


def _clean(text: str) -> str:
    """줄바꿈/공백 정리. 슬라이드 텍스트는 레이아웃 때문에 공백이 지저분하다."""
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def from_pdf(path: Path) -> list[dict]:
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    chunks = []
    for i, page in enumerate(doc, start=1):
        chunks.append({"page": i, "text": _clean(page.get_text()), "notes": ""})
    doc.close()

    if not any(c["text"] for c in chunks):
        raise NoTextError(
            f"{path.name}: {len(chunks)}쪽에서 텍스트를 한 글자도 못 찾았습니다. "
            "스캔본이거나 글자가 이미지로 깔린 PDF입니다."
        )
    return [c for c in chunks if c["text"]]


def _walk(shapes):
    """도형을 재귀 순회. 그룹 안에 텍스트가 든 자료가 흔해서 반드시 파고들어야 한다."""
    for shape in shapes:
        yield shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk(shape.shapes)


def from_pptx(path: Path) -> list[dict]:
    from pptx import Presentation

    prs = Presentation(path)
    chunks = []
    n_picture = 0

    for i, slide in enumerate(prs.slides, start=1):
        parts = []
        for shape in _walk(slide.shapes):
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                n_picture += 1
            if shape.has_text_frame and shape.text_frame.text.strip():
                parts.append(shape.text_frame.text)
            # 표는 발표자료에서 수치 근거가 가장 많이 사는 곳이라 반드시 긁는다
            if getattr(shape, "has_table", False) and shape.has_table:
                for row in shape.table.rows:
                    parts.append(" | ".join(c.text for c in row.cells))

        # 발표자 노트: 청중에겐 안 보이지만 백데이터가 여기 있는 경우가 많다
        notes = ""
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            notes = slide.notes_slide.notes_text_frame.text.strip()

        chunks.append({"page": i, "text": _clean("\n".join(parts)), "notes": _clean(notes)})

    kept = [c for c in chunks if c["text"] or c["notes"]]
    if not kept:
        raise NoTextError(
            f"{path.name}: 슬라이드 {len(chunks)}장에서 텍스트를 한 글자도 못 찾았습니다 "
            f"(그림 도형 {n_picture}개).\n"
            "  디자인 툴에서 이미지로 내보낸 자료입니다. 텍스트 추출로는 검색이 불가능하므로,\n"
            "  슬라이드를 이미지로 렌더해 멀티모달 캡션 경로를 써야 합니다."
        )
    return kept


def ingest(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        raw = from_pdf(path)
    elif suffix == ".pptx":
        raw = from_pptx(path)
    else:
        raise ValueError(f"지원하지 않는 형식: {suffix} (.pdf 또는 .pptx만)")

    out = []
    for c in raw:
        notes = c.get("notes", "")
        body = c["text"] if not notes else f"{c['text']}\n\n[노트] {notes}"
        out.append(
            {
                "id": f"{path.stem}#p{c['page']}",
                "source": path.name,
                "page": c["page"],
                "text": body,
                "n_chars": len(body),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/chunks.jsonl"))
    args = ap.parse_args()

    if not args.input.exists():
        print(f"파일 없음: {args.input}", file=sys.stderr)
        return 1

    try:
        chunks = ingest(args.input)
    except NoTextError as e:
        print(f"[추출 실패] {e}", file=sys.stderr)
        return 3

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    lens = sorted(c["n_chars"] for c in chunks)
    print(f"{args.input.name} -> {args.output}")
    print(f"  슬라이드 {len(chunks)}개")
    print(f"  글자수 min/중앙/max: {lens[0]} / {lens[len(lens) // 2]} / {lens[-1]}")
    thin = [c["page"] for c in chunks if c["n_chars"] < 30]
    if thin:
        print(f"  [주의] 30자 미만 슬라이드 {len(thin)}개: {thin[:10]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
