"""업로드된 발표자료 -> 검색용 청크(chunks.jsonl) 생성.

업로드 API 는 PDF 를 저장만 하고 끝난다. 그런데 ReadyQ 는 chunks.jsonl 을 받아서
뜨므로, 그 사이를 이어주는 단계가 필요하다. 이 파일이 그 단계다.

이예진 님 설계에서 가져온 두 가지 원칙을 그대로 지킨다.
  1. 텍스트를 못 찾으면 조용히 0건으로 넘기지 않고 실패로 알린다 (NoTextError)
  2. 검색이 못 보는 슬라이드가 있으면 발표자에게 고지한다 (quality_report)
     -> "N번 슬라이드는 근거로 못 씁니다" 를 준비 상태 화면에 띄우기 위한 재료
"""

from __future__ import annotations

import json
from pathlib import Path

# ai/ 를 import 경로에 등록하는 부수효과가 필요하다 (ai_engine.py 참고)
import ai_engine  # noqa: F401
from build_chunks import build
from quality_report import analyze, MIN_LETTERS

DATA_DIR = Path("data")

# quality_report.main() 과 같은 기준을 쓴다
FAIL_RATIO = 0.15
WARN_RATIO = 0.05


def chunks_path(presentation_id: str) -> Path:
    """발표 ID 에 대응하는 청크 파일 경로."""
    return DATA_DIR / f"{presentation_id}.jsonl"


def _quality(rows: list[dict]) -> dict:
    a = analyze(rows)
    total = a["total"] or 1
    dead_pages = [r["page"] for r in a["dead"]]
    ratio = len(a["dead"]) / total

    if ratio > FAIL_RATIO:
        verdict = "실패"
        message = ("자료의 상당 부분에서 텍스트를 찾지 못했습니다. "
                   "이 자료로는 근거 검색을 신뢰하기 어렵습니다.")
    elif ratio > WARN_RATIO:
        verdict = "경고"
        message = (f"일부 슬라이드({len(dead_pages)}장)는 근거로 사용할 수 없습니다. "
                   "해당 슬라이드 질문이 나오면 직접 답하셔야 합니다.")
    else:
        verdict = "양호"
        message = "모든 슬라이드가 근거로 사용 가능합니다."

    return {
        "verdict": verdict,
        "message": message,
        "median_letters": round(a["median_letters"]),
        "unsearchable_pages": dead_pages,
        "unsearchable_ratio": round(ratio, 3),
        "min_letters_threshold": MIN_LETTERS,
    }


def build_index(file_path: Path | str, presentation_id: str) -> dict:
    """발표자료를 청크로 만들어 저장하고, 추출 품질까지 판정해 돌려준다.

    성공: {"ok": True, "slides": N, "chunks_path": ..., "quality": {...}}
    실패: {"ok": False, "reason": ..., "message": ...}
         reason = not_found | unsupported | no_text
    """
    path = Path(file_path)
    if not path.exists():
        return {"ok": False, "reason": "not_found",
                "message": f"파일을 찾을 수 없습니다: {path.name}"}

    try:
        # 글자 추출이 안 되는 슬라이드는 이미지로 읽는다 (ai/build_chunks.py)
        built = build(path, slides_dir=DATA_DIR / "slides" / presentation_id)
        rows = built["rows"]
        if not rows:
            return {"ok": False, "reason": built["reason"] or "no_text",
                    "message": built["message"] or "슬라이드를 한 장도 읽지 못했습니다."}
    except ValueError as e:
        return {"ok": False, "reason": "unsupported", "message": str(e)}
    except Exception as e:
        # 파서가 파일을 아예 열지 못하는 경우(손상된 PDF 등).
        # 여기서 안 잡으면 업로드 API 가 500 으로 죽고, 쓸 수 없는 파일이
        # 서버에 그대로 남는다.
        return {"ok": False, "reason": "unreadable",
                "message": f"파일을 열 수 없습니다. 손상되었거나 형식이 올바르지 않습니다. ({type(e).__name__})"}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = chunks_path(presentation_id)
    with out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    return {
        "ok": True,
        "presentation_id": presentation_id,
        "chunks_path": str(out),
        "slides": len(rows),
        "quality": _quality(rows),
        "method": built["method"],
        "captioned": built["captioned"],
        "unreadable": built["unreadable"],
        "unreadable_message": built["message"],
        "api_calls": built["calls"],
    }
