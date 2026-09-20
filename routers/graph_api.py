"""지도 조회. 프론트의 지식 지도 화면이 쓴다.

지도는 이 화면을 열 때 만든다(모델 호출 1회, 10~25초). 한 번 만들면 파일로 남겨 다시 쓴다.
준비(warm) 단계에서 만들지 않는 이유: 답변 경로에서 재봤더니 지도가 있으나 없으나 근거 슬라이드가
12문항 모두 같았다(2026-09-20, ai/README.md). 지도를 안 보는 발표자에게 준비 시간을 물리지 않는다.
"""

import asyncio
import json

from fastapi import APIRouter, HTTPException

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import deck_graph
from indexing import DATA_DIR, chunks_path

router = APIRouter(prefix="/api/graph", tags=["Deck Graph"])

_making: dict[str, asyncio.Lock] = {}   # 같은 발표의 지도를 동시에 만들지 않게


def _lock(key: str) -> asyncio.Lock:
    return _making.setdefault(key, asyncio.Lock())


def _rows(presentation_id: str) -> list[dict]:
    path = chunks_path(presentation_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
    return [json.loads(l) for l in path.open(encoding="utf-8")]


@router.get("/{presentation_id}")
async def get_graph(presentation_id: str):
    import notes as notes_mod

    graph_file = DATA_DIR / "graph" / f"{presentation_id}.json"
    graph = deck_graph.load(graph_file)
    if graph is None:
        async with _lock(f"deck:{presentation_id}"):
            graph = deck_graph.load(graph_file)   # 기다리는 동안 다른 요청이 만들었을 수 있다
            if graph is None:
                saved_notes = notes_mod.NoteStore(DATA_DIR / "notes" / f"{presentation_id}.json").notes
                graph = await asyncio.to_thread(deck_graph.build, _rows(presentation_id), saved_notes)
                if not graph.get("ok"):
                    raise HTTPException(status_code=502, detail="논리 지도를 만들지 못했습니다. 잠시 뒤에 다시 열어주세요.")
                deck_graph.save(graph, graph_file)
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
    그래프(data/kgraph)의 번호와 그대로 맞는다.

    그래프가 없으면 여기서 만든다(모델 호출 1회, 조각 60개 기준 12초). 조각이 많이 바뀌었을 때도 다시 만든다.
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
    ids_now = [c["id"] for c in chunks]
    kg_file = DATA_DIR / "kgraph" / f"{presentation_id}.json"
    kg = knowledge_graph.load(kg_file)
    if kg is None or knowledge_graph.coverage(kg, ids_now) < 0.8:
        async with _lock(f"kg:{presentation_id}"):
            kg = knowledge_graph.load(kg_file)
            if kg is None or knowledge_graph.coverage(kg, ids_now) < 0.8:
                kg = await asyncio.to_thread(knowledge_graph.build, chunks)
                if not kg.get("ok"):
                    raise HTTPException(status_code=502, detail="지식 지도를 만들지 못했습니다. 잠시 뒤에 다시 열어주세요.")
                knowledge_graph.save(kg, kg_file)
    ids = set(ids_now)
    nodes = []
    for c in chunks:
        meta = kg.get("nodes", {}).get(c["id"], {})
        nodes.append({"id": c["id"], "kind": c["kind"], "page": c.get("page"), "text": c["text"],
                      "name": meta.get("name") or c["text"][:18], "topic": meta.get("topic") or "새로 더한 자료"})
    edges = [e for e in kg.get("edges", []) if e["from"] in ids and e["to"] in ids]
    return {"nodes": nodes, "edges": edges, "topics": kg.get("topics", []),
            "coverage": round(knowledge_graph.coverage(kg, [c["id"] for c in chunks]), 2)}
