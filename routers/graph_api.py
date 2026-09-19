"""발표자료 논리 지도 조회. 프론트의 '논리 지도' 화면이 쓴다.

지도는 준비(warm) 단계에서 만들어 data/graph/{id}.json 에 남는다(engine_store 참고).
"""

import json

from fastapi import APIRouter, HTTPException

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import deck_graph
from indexing import DATA_DIR, chunks_path

router = APIRouter(prefix="/api/graph", tags=["Deck Graph"])


@router.get("/{presentation_id}")
async def get_graph(presentation_id: str):
    graph = deck_graph.load(DATA_DIR / "graph" / f"{presentation_id}.json")
    if graph is None:
        raise HTTPException(status_code=404, detail="논리 지도가 아직 없습니다. 자료 준비가 끝나면 만들어집니다.")
    # 점을 눌렀을 때 보여줄 슬라이드 원문 앞부분
    texts = {}
    path = chunks_path(presentation_id)
    if path.exists():
        for line in path.open(encoding="utf-8"):
            r = json.loads(line)
            texts[r["page"]] = r["text"][:300]
    # 슬라이드마다 붙은 발표자 설명 (지도에서 점을 누르면 같이 보인다)
    import notes as notes_mod
    saved = notes_mod.NoteStore(DATA_DIR / "notes" / f"{presentation_id}.json").notes
    # 읽기 좋게 정리한 글이 있으면 같이 준다 (준비 단계에서 만든다)
    import slide_refine
    refined = slide_refine.load(DATA_DIR / "refined" / f"{presentation_id}.json") or {}
    for n in graph.get("nodes", []):
        n["text"] = texts.get(n["page"], "")
        n["refined"] = refined.get(n["page"])
        n["notes"] = [x["text"] for x in notes_mod.for_page(saved, n["page"])]
    graph["general_notes"] = [x["text"] for x in notes_mod.general(saved)]
    return graph
