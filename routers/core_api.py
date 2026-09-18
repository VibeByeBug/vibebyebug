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


class AnswerRequest(BaseModel):
    answer: str
    confirmed: bool = False   # 경고를 보고도 "맞게 말했음" 을 눌렀는가


@router.post("/{presentation_id}/{kind}/answer")
async def save_from_answer(presentation_id: str, kind: str, req: AnswerRequest):
    """연습에서 한 답을 칸으로 정리해 저장한다. 확정 버튼을 따로 누르지 않아도 된다.

    저장 전에 슬라이드와 대조한다. 맞지 않는 곳이 있으면 저장하지 않고 경고를 돌려준다.
    발표자가 확인하고 confirmed=true 로 다시 보내야 저장된다.
    """
    if kind not in core_answers.LABEL:
        raise HTTPException(status_code=400, detail="모르는 질문 종류입니다.")
    if not req.answer.strip():
        raise HTTPException(status_code=400, detail="답이 비어 있습니다.")
    path = chunks_path(presentation_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
    rows = [json.loads(l) for l in path.open(encoding="utf-8")]

    warnings = [] if req.confirmed else await asyncio.to_thread(core_answers.check_answer, rows, req.answer)
    if warnings:
        return {"status": "needs_review", "warnings": warnings}

    steps = await asyncio.to_thread(core_answers.steps_from_answer, core_answers.LABEL[kind], req.answer)
    store = _store(presentation_id)
    try:
        card = store.approve(kind, steps, edited=False, source="answer")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    card["answer"] = req.answer
    card["confirmed_despite_warning"] = req.confirmed
    store._save()
    _sync_engine(presentation_id, store)
    return {"status": "saved", "card": card}


@router.delete("/{presentation_id}/{kind}")
async def discard(presentation_id: str, kind: str):
    store = _store(presentation_id)
    store.discard(kind)
    _sync_engine(presentation_id, store)
    return {"status": "success"}
