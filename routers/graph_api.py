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


@router.get("/{presentation_id}/knowledge")
async def get_knowledge(presentation_id: str):
    """프로젝트 지식 지도. 슬라이드, 대본, 설명 자료, 리허설의 지식 조각과 조각 사이의 관계.

    조각은 지금 저장된 자료로 다시 만든다(모델을 부르지 않아 빠르다). 조각 번호가 내용에서 나오므로
    준비 단계에서 만든 지식 그래프(data/kgraph)의 번호와 그대로 맞는다.
    """
    import knowledge
    import knowledge_graph
    import notes as notes_mod
    import slide_refine
    import engine_store

    rq = engine_store.get_engine(presentation_id)
    if rq is not None:
        chunks = rq.kb
    else:
        path = chunks_path(presentation_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
        rows = [json.loads(l) for l in path.open(encoding="utf-8")]
        saved = notes_mod.NoteStore(DATA_DIR / "notes" / f"{presentation_id}.json").notes
        refined = slide_refine.load(DATA_DIR / "refined" / f"{presentation_id}.json") or {}
        chunks = knowledge.build(rows, saved, refined)
    kg = knowledge_graph.load(DATA_DIR / "kgraph" / f"{presentation_id}.json")
    if kg is None:
        raise HTTPException(status_code=404, detail="지식 지도가 아직 없습니다. 자료 준비가 끝나면 만들어집니다.")
    ids = {c["id"] for c in chunks}
    nodes = []
    for c in chunks:
        meta = kg.get("nodes", {}).get(c["id"], {})
        nodes.append({"id": c["id"], "kind": c["kind"], "page": c.get("page"), "text": c["text"],
                      "name": meta.get("name") or c["text"][:18], "topic": meta.get("topic") or "새로 더한 자료"})
    edges = [e for e in kg.get("edges", []) if e["from"] in ids and e["to"] in ids]
    return {"nodes": nodes, "edges": edges, "topics": kg.get("topics", []),
            "coverage": round(knowledge_graph.coverage(kg, [c["id"] for c in chunks]), 2)}
