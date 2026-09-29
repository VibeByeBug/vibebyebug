"""모의 연습 — 발표자료로 만든 예상 질문과 답변 커버리지 판정.

질문은 ai/mock_defense.py 가 만든다(유형마다 모델 호출 1회, 1분 안팎). 발표 전에 하는 일이라 느려도 된다.
한 번 만들면 data/practice/{pid}.json 에 저장해 두고 다시 쓴다.

판정은 모델을 부르지 않는다. 근거 줄에서 뽑은 수치와 핵심어가 발표자 답변에 나왔는지 대조한다.
연습 중에는 발표자가 화면 앞에서 기다리므로, 지어낼 여지가 없는 자리는 규칙으로 둔다.
"""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import engine_store
import mock_defense
from indexing import DATA_DIR, chunks_path

router = APIRouter(prefix="/api/practice", tags=["Mock Practice"])

PER_TYPE = 2      # 유형마다 질문 수. 4유형이라 8문항, 한 번 연습에 5분 안팎
MIN_CHARS = 80    # 글자가 너무 적은 슬라이드(표지, 목차)에서는 질문을 만들지 않는다
_making: set[str] = set()   # 같은 발표로 동시에 만들지 않게


def _path(pid: str):
    return DATA_DIR / "practice" / f"{pid}.json"


def _engine(pid: str):
    rq = engine_store.get_engine(pid)
    if rq is None:
        raise HTTPException(status_code=409, detail="발표 준비가 끝난 뒤에 쓸 수 있어요.")
    return rq


def _make(pid: str) -> list[dict]:
    """예상 질문을 만든다. 유형마다 호출 1회, 꼬리질문에 1회."""
    path = chunks_path(pid)
    if not path.exists():
        raise HTTPException(status_code=404, detail="발표 자료를 찾을 수 없습니다.")
    rows = [json.loads(l) for l in path.open(encoding="utf-8")]
    targets = [r for r in rows if int(r.get("n_chars") or 0) >= MIN_CHARS]
    if not targets:
        raise HTTPException(status_code=422, detail="질문을 만들 만한 슬라이드가 없습니다.")

    valid = {r["page"] for r in targets}
    slides = "\n\n".join(f"[슬라이드 {r['page']}]\n{r['text']}" for r in targets)
    provider, model = "openai", mock_defense.TEXT_MODELS["openai"]

    made: list[dict] = []
    for qtype, brief in mock_defense.TYPE_BRIEF.items():
        prompt = mock_defense.PROMPT.format(qtype=qtype, brief=brief, n=PER_TYPE, slides=slides)
        try:
            got = mock_defense._parse(mock_defense._call_retry(prompt, provider, model), valid)
        except Exception:
            continue   # 한 유형이 실패해도 나머지로 연습할 수 있다
        for page, q in got[:PER_TYPE]:
            made.append({"question": q, "type": qtype, "page": int(page)})
    if not made:
        raise HTTPException(status_code=502, detail="예상 질문을 만들지 못했습니다. 잠시 뒤에 다시 해주세요.")

    # 근거(답변에 나왔어야 할 것)를 미리 붙여둔다. 판정할 때 다시 계산하지 않는다.
    rq = _engine(pid)
    from pipeline import _idf
    idf = _idf(rq.rows, rq.nouns)
    for m in made:
        c = mock_defense.judge("", m["question"], m["page"], rq, idf)
        m["facts"] = c.facts
        m["snippet"] = c.snippet

    # 꼬리질문. 연습 중에 만들면 발표자가 기다리게 되므로 여기서 한 번에 만든다.
    items = "\n".join(f"[{i}] {m['question']} / 근거: {', '.join(m['facts'][:4])}"
                      for i, m in enumerate(made, 1) if m["facts"])
    if items:
        try:
            raw = mock_defense._call_retry(mock_defense.FOLLOWUP_PROMPT.format(items=items), provider, model)
            for line in raw.splitlines():
                parts = line.replace("[", "").replace("]", "").split("\t")
                if len(parts) >= 2 and parts[0].strip().isdigit():
                    i = int(parts[0].strip()) - 1
                    if 0 <= i < len(made):
                        made[i]["followup"] = parts[1].strip()
        except Exception:
            pass   # 꼬리질문이 없어도 연습은 된다

    out = _path(pid)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(made, ensure_ascii=False), encoding="utf-8")
    return made


@router.get("/{pid}/questions")
async def questions(pid: str, refresh: bool = False):
    """예상 질문 목록. 만들어 둔 게 있으면 그대로 준다."""
    path = _path(pid)
    if path.exists() and not refresh:
        return {"presentation_id": pid, "questions": json.loads(path.read_text(encoding="utf-8")), "made": False}

    if pid in _making:
        raise HTTPException(status_code=409, detail="예상 질문을 만드는 중입니다.")
    _making.add(pid)
    try:
        made = await asyncio.to_thread(_make, pid)
    finally:
        _making.discard(pid)
    return {"presentation_id": pid, "questions": made, "made": True}


class JudgeRequest(BaseModel):
    question: str
    page: int
    answer: str


@router.post("/{pid}/judge")
async def judge(pid: str, req: JudgeRequest):
    """발표자 답변이 근거를 얼마나 담았는지. 모델을 부르지 않아 바로 나온다."""
    rq = _engine(pid)
    from pipeline import _idf
    c = await asyncio.to_thread(mock_defense.judge, req.answer, req.question, req.page, rq,
                                _idf(rq.rows, rq.nouns))
    return {
        "ratio": round(c.ratio, 2),
        "facts": c.facts,
        "covered": c.covered,
        "missed": c.missed,
        "snippet": c.snippet,
        # 고른 줄 밖이지만 같은 슬라이드에 있는 수치를 말한 경우. 틀린 답이 아니다.
        "elsewhere": c.elsewhere or [],
    }
