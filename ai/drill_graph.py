"""모의 디펜스 꼬리질문 — 답변이 부족하면 파고든다.

계획서의 '모의 디펜스 꼬리질문 멀티턴 흐름'이다. LangGraph 를 쓰는 이유는 분기가
복잡해서가 아니라 두 가지다.

  1. 사람을 기다리며 멈춘다        -> interrupt()
  2. 상태가 요청 사이를 넘어간다    -> checkpointer

터미널이면 반복문으로 충분하지만, 실제 제품은 웹앱이라 답변 하나하나가 별개의 요청이다.
지금 어느 질문인지, 꼬리질문 몇 번째인지, 무엇을 아직 못 댔는지를 요청 사이에 들고
있어야 한다. checkpointer 가 그걸 한다.

저장소는 갈아끼우는 부분이다. 지금은 메모리(MemorySaver)를 쓰고, 백엔드가 정하면
SqliteSaver / Postgres 로 바꾸면 된다. 그래프 구조는 안 건드려도 된다.

흐름:
    ask -> (사람 답변 대기) -> judge -> 충분한가?
                                         아니오 -> followup -> ask ...
                                         예     -> 끝
"""

from __future__ import annotations

import re
from typing import Annotated, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from mock_defense import key_facts
from pipeline import ReadyQ, _best_line, _idf

# 이 이상 파고들지 않는다. 연습이지 심문이 아니다.
MAX_FOLLOWUP = 2
# 이만큼 근거를 댔으면 넘어간다
ENOUGH = 0.7

# 미리 만든 꼬리질문이 없거나 두 번째 되물음일 때 쓴다. 지어낼 여지가 없다.
FALLBACK = {
    "number": "그 부분 구체적인 수치를 말씀해주실 수 있나요?",
    "other":  "방금 말씀하신 근거를 자료 어디에서 확인할 수 있는지 짚어주시겠어요?",
}


class DrillState(TypedDict):
    question: str
    qtype: str
    gold_page: int
    facts: list[str]          # 답변에 나왔어야 할 것 전체
    covered: list[str]        # 여태 답변들에서 나온 것
    turns: list[dict]         # [{ask, answer, ratio, missed}]
    depth: int                # 꼬리질문 횟수
    snippet: str
    pending_ask: str          # 지금 던질 질문 (원질문 또는 꼬리질문)
    prepared_followup: str    # gen 단계에서 미리 만들어 둔 되물음


def _norm(s: str) -> str:
    return re.sub(r"[\s,]", "", s).lower()


def _is_num(w: str) -> bool:
    return bool(re.match(r"^\d", w))


def build(rq: ReadyQ, idf: dict):
    """그래프를 만든다. 연습 중에는 모델을 부르지 않는다 - 꼬리질문은 미리 만들어 둔 것을 쓴다."""

    def ask(state: DrillState) -> DrillState:
        # 여기서 멈춰 사람 답변을 기다린다. 웹앱이면 여기서 응답을 내보내고
        # 다음 요청이 Command(resume=답변) 으로 들어온다.
        answer = interrupt({"ask": state["pending_ask"],
                            "qtype": state["qtype"],
                            "depth": state["depth"]})
        turns = state["turns"] + [{"ask": state["pending_ask"], "answer": answer}]
        return {**state, "turns": turns}

    def judge(state: DrillState) -> DrillState:
        answer = state["turns"][-1]["answer"] or ""
        na = _norm(answer)
        # 누적한다 - 꼬리질문에서 마저 말했으면 그것도 인정
        covered = list(state["covered"])
        for f in state["facts"]:
            if f not in covered and _norm(f) in na:
                covered.append(f)
        missed = [f for f in state["facts"] if f not in covered]
        ratio = len(covered) / len(state["facts"]) if state["facts"] else 1.0
        turns = state["turns"][:-1] + [{**state["turns"][-1],
                                        "ratio": ratio, "missed": missed}]
        return {**state, "covered": covered, "turns": turns}

    def followup(state: DrillState) -> DrillState:
        """되물을 질문을 고른다. 연습 중에는 모델을 부르지 않는다.

        발표자가 화면 앞에서 기다리는 중이라, 여기서 모델을 부르면 속도 제한에 걸려
        몇 분씩 멈춘다. 꼬리질문은 gen 단계에서 미리 만들어 둔다(mock_defense.gen).
        """
        missed = [f for f in state["facts"] if f not in state["covered"]]
        kind = "number" if any(_is_num(f) for f in missed) else "other"

        q = state.get("prepared_followup") or ""
        # 미리 만든 것은 한 번만 쓴다. 두 번째부터는 같은 말을 반복하지 않도록 템플릿으로.
        if q and state["depth"] == 0:
            # 답을 흘리면 버린다 (gen 에서도 거르지만 여기서 한 번 더)
            if any(_norm(f) in _norm(q) for f in missed):
                q = ""
        else:
            q = ""

        return {**state, "pending_ask": q or FALLBACK[kind],
                "depth": state["depth"] + 1}

    def enough(state: DrillState) -> str:
        if state["depth"] >= MAX_FOLLOWUP:
            return "done"                      # 연습이지 심문이 아니다
        last = state["turns"][-1]
        missed = last.get("missed", [])
        # 수치가 남아 있으면 비율이 높아도 통과시키지 않는다.
        # "몇 퍼센트였나요"에 주변 사실 셋을 대고 정작 그 수치를 안 말했는데
        # 75%로 통과시키면, 실전에서 그대로 막힌다.
        if any(_is_num(f) for f in missed):
            return "more"
        return "done" if last.get("ratio", 0) >= ENOUGH else "more"

    g = StateGraph(DrillState)
    g.add_node("ask", ask)
    g.add_node("judge", judge)
    g.add_node("followup", followup)
    g.set_entry_point("ask")
    g.add_edge("ask", "judge")
    g.add_conditional_edges("judge", enough, {"more": "followup", "done": END})
    g.add_edge("followup", "ask")

    # 저장소는 여기만 바꾸면 된다 (SqliteSaver / PostgresSaver 등)
    return g.compile(checkpointer=MemorySaver())


def make_state(question: str, qtype: str, gold_page: int,
               rq: ReadyQ, idf: dict, prepared_followup: str = "") -> DrillState:
    row = next((r for r in rq.rows if r["page"] == gold_page), None)
    if row is None:
        return DrillState(question=question, qtype=qtype, gold_page=gold_page,
                          facts=[], covered=[], turns=[], depth=0,
                          snippet="", pending_ask=question,
                          prepared_followup=prepared_followup)
    i = rq.rows.index(row)
    qwords = {w.lower() for w in rq.nouns(question)}
    line = _best_line(rq.prepared[i], qwords, qtype, rq.idf) or row["text"][:120]
    return DrillState(question=question, qtype=qtype, gold_page=gold_page,
                      facts=key_facts(line, rq.nouns, idf), covered=[],
                      turns=[], depth=0, snippet=line, pending_ask=question,
                      prepared_followup=prepared_followup)
