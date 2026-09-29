"""청중 화면에 띄울 슬라이드 원본.

  GET /api/slides/{id}/{page}.png          슬라이드 원본 이미지 (올린 PDF 에서 그린다, 한 번 그리면 파일로 둔다)
  GET /api/slides/{id}/{page}/highlight?q=  근거 문장이 그 페이지 어디에 있는지 (0~1 비율 좌표)

청중 화면에는 AI 가 만든 문장을 보내지 않는다. 발표자가 고른 슬라이드 원본과,
그 안에서 근거가 된 줄의 위치만 보낸다.
"""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from indexing import DATA_DIR

router = APIRouter(prefix="/api/slides", tags=["Audience Slides"])

UPLOAD_DIR = Path("uploaded_files")
ZOOM = 2.0            # PDF 72dpi 기준 2배. 16:9 슬라이드면 가로 1920px 안팎


def _pdf(pid: str):
    import fitz
    path = UPLOAD_DIR / f"{pid}.pdf"
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료 원본을 찾을 수 없습니다.")
    return fitz.open(path)


@router.get("/{pid}/{page}.png")
def slide_png(pid: str, page: int):
    out = DATA_DIR / "slide_png" / pid / f"p{page}.png"
    if not out.exists():
        import fitz
        with _pdf(pid) as doc:
            if not 1 <= page <= doc.page_count:
                raise HTTPException(status_code=404, detail="없는 슬라이드입니다.")
            pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
            out.parent.mkdir(parents=True, exist_ok=True)
            pix.save(out)
    return FileResponse(out, media_type="image/png")


def _tokens(q: str) -> list[str]:
    """찾을 낱말. 숫자가 붙은 말과 긴 말을 먼저 (흔한 짧은 말은 여기저기 걸린다)."""
    words = [w.strip("•·-()[]\"'“”,.:") for w in re.split(r"[\s/|]+", q)]
    words = [w for w in words if len(w) >= 2]
    words.sort(key=lambda w: (not re.search(r"\d", w), -len(w)))
    return words[:8]


@router.get("/{pid}/{page}/highlight")
def highlight(pid: str, page: int, q: str = Query("", max_length=400)):
    """근거 줄의 위치. 문장을 통째로 찾고, 없으면 낱말로 찾아 가장 많이 걸린 줄을 고른다.

    PDF 글자에는 띄어쓰기가 빠진 경우가 많아("구독500 명으로운영BEP") 문장 통째로는 잘 안 걸린다.
    낱말은 띄어쓰기 없는 글자 안에서도 찾힌다.
    """
    with _pdf(pid) as doc:
        if not 1 <= page <= doc.page_count:
            raise HTTPException(status_code=404, detail="없는 슬라이드입니다.")
        p = doc[page - 1]
        W, H = p.rect.width, p.rect.height
        q = (q or "").strip()
        rects = p.search_for(q) if q else []
        if not rects:
            hits = []
            for w in _tokens(q):
                hits += p.search_for(w)
            if not hits:
                return {"boxes": []}
            # 같은 줄(세로 위치가 비슷한 것)끼리 묶어 가장 많이 걸린 줄을 고른다
            lines: list[list] = []
            for r in sorted(hits, key=lambda r: r.y0):
                for line in lines:
                    if abs(line[0].y0 - r.y0) < r.height * 0.6:
                        line.append(r)
                        break
                else:
                    lines.append([r])
            best = max(lines, key=len)
            x0 = min(r.x0 for r in best); y0 = min(r.y0 for r in best)
            x1 = max(r.x1 for r in best); y1 = max(r.y1 for r in best)
            # 낱말이 걸린 자리만 칠하면 줄 일부만 칠해진다. PDF 의 글자 줄 전체로 넓힌다.
            for block in p.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    lx0, ly0, lx1, ly1 = line["bbox"]
                    if ly0 < y1 and ly1 > y0 and lx0 < x1 and lx1 > x0:
                        x0, y0, x1, y1 = min(x0, lx0), min(y0, ly0), max(x1, lx1), max(y1, ly1)
            rects = [type(best[0])(x0, y0, x1, y1)]
        pad = 4
        return {"boxes": [[max(0, (r.x0 - pad) / W), max(0, (r.y0 - pad) / H),
                           min(1, (r.x1 + pad) / W), min(1, (r.y1 + pad) / H)] for r in rects[:4]]}
