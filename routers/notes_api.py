"""발표자 설명 모으기 - 리허설 녹음, 발표 대본, 설명 자료.

  GET    /api/notes/{id}                슬라이드 목록과 저장된 설명
  POST   /api/notes/{id}/classify       글을 문장으로 나눠 분류 (저장 안 함, 발표자 확인용)
  POST   /api/notes/{id}/classify-file  파일(txt, md, pdf)에서 글을 꺼내 분류
  POST   /api/notes/{id}/save           확인한 문장 저장 → 검색 색인에 바로 반영
  DELETE /api/notes/{id}/{note_id}      설명 하나 지우기
  POST   /api/notes/{id}/rebuild-graph  설명까지 넣어 논리 지도 다시 만들기
  GET    /api/notes/{id}/refined        읽기 좋게 정리한 슬라이드 글 (없으면 만든다, 20초 안팎)
"""

import asyncio
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import deck_graph
import engine_store
import notes as notes_mod
import slide_refine
from indexing import DATA_DIR, chunks_path

router = APIRouter(prefix="/api/notes", tags=["Presenter Notes"])


def notes_path(pid: str):
    return DATA_DIR / "notes" / f"{pid}.json"


def graph_path(pid: str):
    return DATA_DIR / "graph" / f"{pid}.json"


def refined_path(pid: str):
    return DATA_DIR / "refined" / f"{pid}.json"


def _rows(pid: str) -> list[dict]:
    path = chunks_path(pid)
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
    return [json.loads(l) for l in path.open(encoding="utf-8")]


class ClassifyRequest(BaseModel):
    text: str
    source: str = "rehearsal"      # rehearsal | script | doc
    page: int | None = None        # 리허설이면 지금 설명한 슬라이드


class Item(BaseModel):
    page: int | None = None
    kind: str
    text: str


class SaveRequest(BaseModel):
    items: list[Item]
    source: str = "rehearsal"


@router.get("/{pid}")
async def get_notes(pid: str):
    rows = _rows(pid)
    refined = slide_refine.load(refined_path(pid)) or {}
    slides = [{"page": r["page"],
               "title": next((l for l in r["text"].split("\n") if l.strip()), "")[:40],
               "text": r["text"], "refined": refined.get(r["page"])} for r in rows]
    return {"slides": slides, "notes": notes_mod.NoteStore(notes_path(pid)).notes}


@router.get("/{pid}/refined")
async def refined(pid: str):
    """읽기 좋게 정리한 슬라이드 글. 준비 단계에서 미리 만들어두지만, 없으면 여기서 만든다."""
    rows = _rows(pid)
    got = slide_refine.load(refined_path(pid))
    if got is None:
        got = await asyncio.to_thread(slide_refine.refine, rows)
        if got:
            slide_refine.save(got, refined_path(pid))
    return {"refined": {str(k): v for k, v in (got or {}).items()}}


@router.post("/{pid}/classify")
async def classify(pid: str, req: ClassifyRequest):
    rows = _rows(pid)
    store = notes_mod.NoteStore(notes_path(pid))
    try:
        items = await asyncio.to_thread(notes_mod.classify, rows, req.text, req.source, req.page, store.notes)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"items": items}


def _extract(name: str, data: bytes) -> str:
    low = name.lower()
    if low.endswith(".pdf"):
        import fitz
        with fitz.open(stream=data, filetype="pdf") as doc:
            return "\n\n".join(p.get_text() for p in doc)
    if low.endswith((".txt", ".md")):
        for enc in ("utf-8-sig", "cp949"):
            try:
                return data.decode(enc)
            except UnicodeDecodeError:
                continue
    raise HTTPException(status_code=400, detail="txt, md, pdf 파일만 올릴 수 있습니다. 다른 형식은 내용을 붙여넣어 주세요.")


@router.post("/{pid}/classify-file")
async def classify_file(pid: str, file: UploadFile = File(...), source: str = Form("doc")):
    rows = _rows(pid)
    text = _extract(file.filename or "", await file.read())
    if not text.strip():
        raise HTTPException(status_code=400, detail="파일에서 글자를 찾지 못했습니다.")
    store = notes_mod.NoteStore(notes_path(pid))
    try:
        items = await asyncio.to_thread(notes_mod.classify, rows, text, source, None, store.notes)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"items": items, "chars": len(text)}


def _sync(pid: str, store: notes_mod.NoteStore) -> None:
    rq = engine_store.get_engine(pid)
    if rq is not None:
        rq.set_notes(store.notes)


@router.post("/{pid}/save")
async def save(pid: str, req: SaveRequest):
    store = notes_mod.NoteStore(notes_path(pid))
    added = store.add([i.model_dump() for i in req.items], req.source)
    # 검색 색인을 다시 만든다 (19장 기준 1~2초). 이벤트 루프를 막지 않게 스레드로.
    await asyncio.to_thread(_sync, pid, store)
    return {"added": len(added), "notes": store.notes}


@router.delete("/{pid}/{note_id}")
async def delete(pid: str, note_id: str):
    store = notes_mod.NoteStore(notes_path(pid))
    store.delete(note_id)
    await asyncio.to_thread(_sync, pid, store)
    return {"notes": store.notes}


@router.post("/{pid}/rebuild-graph")
async def rebuild_graph(pid: str):
    rows = _rows(pid)
    store = notes_mod.NoteStore(notes_path(pid))
    graph = await asyncio.to_thread(deck_graph.build, rows, store.notes)
    if not graph.get("ok"):
        raise HTTPException(status_code=502, detail="논리 지도를 만들지 못했습니다. 잠시 뒤 다시 시도해주세요.")
    deck_graph.save(graph, graph_path(pid))
    rq = engine_store.get_engine(pid)
    if rq is not None:
        rq.set_graph(graph)
    return {"edges": len(graph["edges"]), "notes_used": graph.get("notes_used", 0)}
