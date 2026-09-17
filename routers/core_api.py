"""기본 질문 답변 - 연습에서 추천받고 발표자가 확정한다.

  GET    /api/core/{id}/suggest      AI 추천 (호출 1회, 약 10초). 확정한 카드도 같이 돌려준다
  GET    /api/core/{id}              확정한 카드만
  POST   /api/core/{id}/{kind}       확정 (고친 칸이면 edited=true)
  DELETE /api/core/{id}/{kind}       버림

확정이 바뀌면 준비된 엔진에 바로 반영한다. 실전에서는 확정한 카드만 뜨고 추론하지 않는다.
"""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import core_answers
import engine_store
from indexing import DATA_DIR, chunks_path

router = APIRouter(prefix="/api/core", tags=["Core Answers"])


def core_path(presentation_id: str):
    return DATA_DIR / "core" / f"{presentation_id}.json"


def _store(presentation_id: str) -> core_answers.CoreStore:
    return core_answers.CoreStore(core_path(presentation_id))


def _sync_engine(presentation_id: str, store: core_answers.CoreStore) -> None:
    rq = engine_store.get_engine(presentation_id)
    if rq is not None:
        rq.set_core(store.cards)


class Step(BaseModel):
    text: str
    slide: int | None = None


class ApproveRequest(BaseModel):
    steps: list[Step]
    edited: bool = False


@router.get("/{presentation_id}/suggest")
async def suggest(presentation_id: str):
    path = chunks_path(presentation_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
    rows = [json.loads(l) for l in path.open(encoding="utf-8")]
    # 모델 호출이 10초 가까이 걸려서 이벤트 루프를 막지 않게 스레드로 넘긴다
    suggestions = await asyncio.to_thread(core_answers.suggest, rows)
    store = _store(presentation_id)
    items = []
    for c in core_answers.CORE:
        s = suggestions.get(c["id"], {})
        items.append({
            "id": c["id"],
            "label": c["label"],
            "suggested": s.get("steps", []),
            "status": s.get("status", "no_answer"),
            "approved": store.cards.get(c["id"]),
        })
    return {"presentation_id": presentation_id, "items": items}


@router.get("/{presentation_id}")
async def approved(presentation_id: str):
    return {"presentation_id": presentation_id, "cards": _store(presentation_id).cards}


@router.post("/{presentation_id}/{kind}")
async def approve(presentation_id: str, kind: str, req: ApproveRequest):
    store = _store(presentation_id)
    try:
        card = store.approve(kind, [s.model_dump() for s in req.steps], req.edited)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _sync_engine(presentation_id, store)
    return {"status": "success", "card": card}


@router.delete("/{presentation_id}/{kind}")
async def discard(presentation_id: str, kind: str):
    store = _store(presentation_id)
    store.discard(kind)
    _sync_engine(presentation_id, store)
    return {"status": "success"}
