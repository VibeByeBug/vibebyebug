"""기본 질문 답변 - 연습에서 AI 가 추천하고, 발표자가 확정한 것만 실전에 띄운다.

"이 프로젝트의 의의는?" 같은 질문은 어느 발표에나 나오는데, 슬라이드 한 줄에 적혀 있지 않고
여러 장에 흩어져 있다. 슬라이드 검색은 한 줄을 찾는 방식이라 이런 질문에 답을 못 했다.

그렇다고 실전에서 모델이 자료를 종합하게 하면 추론이 섞인 말이 근거처럼 뜬다.
그래서 추론은 연습으로 옮긴다.

  연습  질문 종류마다 AI 가 자료 전체를 읽고 흐름도 칸을 추천한다 (호출 1회로 전부)
        발표자가 확정, 고쳐서 확정, 버림 중에 고른다
  실전  질문 종류를 판정해서 확정된 카드가 있으면 그대로 띄운다 (호출 0회)
        확정 안 된 종류면 지금처럼 슬라이드 검색으로 간다

질문 종류는 서로 확실히 갈리는 닫힌 목록으로 둔다. 세부 내용 질문까지 넓히면 예전처럼
비슷하지만 다른 질문에 저장된 답이 뜬다(README "미리 만든 모범 답변을 실전에 붙이지 않은 이유").
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

# 질문 종류. words 는 질문에 들어가면 그 종류로 보는 말이다.
CORE = [
    {"id": "significance", "label": "이 프로젝트의 의의", "words": ("의의", "가치", "중요성", "의미")},
    {"id": "why", "label": "이 프로젝트를 만든 이유", "words": ("이유", "계기", "배경", "동기", "목적", "필요성", "왜")},
    {"id": "merit", "label": "기존과 다른 점, 장점", "words": ("장점", "강점", "차별", "경쟁력", "차이", "다른 점", "나은 점")},
    {"id": "limit", "label": "이 프로젝트의 한계", "words": ("한계", "단점", "약점", "리스크", "보완", "아쉬운")},
    {"id": "plan", "label": "앞으로의 계획", "words": ("계획", "향후", "앞으로", "로드맵", "확장", "발전 방향")},
    {"id": "effect", "label": "기대 효과", "words": ("효과", "기대효과", "기대되는", "도움이")},
    {"id": "target", "label": "누가 쓰는가", "words": ("대상", "타깃", "사용자", "누가 쓰", "누구를", "고객")},
    {"id": "summary", "label": "한 줄로 설명하면", "words": ("한 줄", "한마디", "요약", "뭔가요", "무엇인가요", "뭐예요", "뭐하는")},
]
LABEL = {c["id"]: c["label"] for c in CORE}

SHAPE = {
    "significance": "1칸 해결하는 문제 → 2칸 이 프로젝트가 처음 한 것 → 3칸 그 결과가 주는 가치",
    "why": "1칸 문제 상황 → 2칸 그 문제를 보여주는 수치 → 3칸 그래서 만든 것",
    "merit": "1칸 기존 방식 → 2칸 우리 방식의 다른 점 → 3칸 그 차이를 보여주는 수치",
    "limit": "1칸 인정할 한계 → 2칸 이 분석이 다루는 범위 → 3칸 그래도 결론이 유효한 이유나 보완 계획",
    "plan": "1칸 가까운 단계 → 2칸 다음 단계 → 3칸 최종 목표",
    "effect": "1칸 누구에게 → 2칸 무엇이 좋아지는지 → 3칸 그 크기를 보여주는 수치",
    "target": "1칸 주 사용자 → 2칸 그 사용자가 겪는 문제 → 3칸 넓힐 수 있는 대상",
    "summary": "1칸 무엇을 → 2칸 어떻게 → 3칸 무엇을 얻는지",
}

PROMPT = """아래는 발표 슬라이드 전체다. 청중이 자주 묻는 기본 질문마다, 발표자가 말할 순서를 흐름도 칸 3개로 정리해줘.
발표자는 이걸 보고 고친 뒤 확정한다. 슬라이드 한 장에 적혀 있지 않아도 여러 장을 종합해서 만들어도 된다.

지켜야 할 것:
1. 한 칸은 22자 이내. 조사와 어미를 빼고 명사형으로 끝내.
2. 슬라이드 내용만 근거로 써. 슬라이드에 없는 사실, 숫자, 이름은 지어내지 마.
3. 숫자는 슬라이드에 적힌 그대로.
4. 칸마다 근거로 삼은 슬라이드 번호를 붙여.
5. 슬라이드로 답을 만들 수 없는 질문은 칸 대신 "없음" 한 줄만 써.

질문과 칸 구성:
{items}

출력 형식 (다른 말 붙이지 말고 이것만):
## 질문id
슬라이드번호 | 칸 내용
슬라이드번호 | 칸 내용
슬라이드번호 | 칸 내용

--- 슬라이드 ---
{slides}"""

MAX_STEP_CHARS = 30


def classify(question: str) -> str | None:
    """질문이 어느 기본 질문인가. 두 종류 이상에 걸리면 판정하지 않는다(엉뚱한 카드를 띄우지 않게)."""
    q = question or ""
    hits = [c["id"] for c in CORE if any(w in q for w in c["words"])]
    # "뭔가요" 는 어떤 질문 끝에도 붙는다 ("의의는 뭔가요?"). 다른 종류가 같이 걸리면 그쪽을 따른다.
    if len(hits) > 1 and "summary" in hits:
        hits.remove("summary")
    return hits[0] if len(hits) == 1 else None


def _numbers_ok(text: str, source: str) -> bool:
    src = re.sub(r"[\s,]", "", source)
    return all(n.replace(",", "") in src for n in re.findall(r"\d+(?:[.,]\d+)*", text))


def suggest(rows: list[dict], ids: list[str] | None = None) -> dict:
    """연습용 추천. {id: {"label", "steps": [{"text", "slide"}], "status"}}

    status: ok | no_answer(자료로 못 만듦) | error
    숫자가 슬라이드에 없는 칸은 버린다. 칸이 하나도 안 남으면 no_answer.
    """
    from answer import Answerer

    ids = ids or [c["id"] for c in CORE]
    by_page = {r["page"]: r["text"] for r in rows}
    slides = "\n\n".join(f"[{p}번 슬라이드]\n{t}" for p, t in sorted(by_page.items()))
    items = "\n".join(f"- {i}: {LABEL[i]} ({SHAPE[i]})" for i in ids)

    out = {i: {"label": LABEL[i], "steps": [], "status": "no_answer"} for i in ids}
    ans = Answerer()
    if not ans.ready():
        for v in out.values():
            v["status"] = "error"
        return out
    try:
        raw = ans._get().chat.completions.create(
            model=ans.model, reasoning_effort="low",
            messages=[{"role": "user", "content": PROMPT.format(items=items, slides=slides)}],
        ).choices[0].message.content or ""
    except Exception:
        for v in out.values():
            v["status"] = "error"
        return out

    cur = None
    for line in raw.splitlines():
        line = line.strip().strip("*")
        head = re.match(r"^#+\s*([a-z]+)", line)
        if head:
            cur = head.group(1) if head.group(1) in out else None
            continue
        m = re.match(r"^\D{0,6}?(\d{1,3})\s*[|\t:]\s*(.+)$", line)
        if not cur or not m:
            continue
        slide, text = int(m.group(1)), m.group(2).strip().strip("\"'")
        # 모델이 칸 끝에 근거 번호를 또 붙인다 ("토큰버짓 챌린지 최초[3]"). 숫자 검사에 걸려 칸이 버려졌다.
        text = re.sub(r"\s*[\[(]\s*(?:p\.?\s*)?\d{1,3}\s*[\])]\s*$", "", text).strip()
        if slide not in by_page or not _numbers_ok(text, by_page[slide]):
            continue
        if len(out[cur]["steps"]) < 3:
            out[cur]["steps"].append({"text": text[:MAX_STEP_CHARS], "slide": slide})
            out[cur]["status"] = "ok"
    return out


# ── 확정한 답 저장 ─────────────────────────────────────────────────────────

class CoreStore:
    """발표 하나의 확정 카드. 발표자가 고친 칸은 숫자 검사를 하지 않는다(발표자가 쓴 말이다)."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.cards: dict[str, dict] = {}
        if self.path.exists():
            try:
                self.cards = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                self.cards = {}

    def approve(self, cid: str, steps: list[dict], edited: bool) -> dict:
        if cid not in LABEL:
            raise ValueError(f"모르는 질문 종류: {cid}")
        steps = [{"text": str(s.get("text", "")).strip()[:MAX_STEP_CHARS], "slide": s.get("slide")}
                 for s in steps if str(s.get("text", "")).strip()][:3]
        if not steps:
            raise ValueError("칸이 비어 있습니다")
        card = {"id": cid, "label": LABEL[cid], "steps": steps, "edited": bool(edited),
                "approved_at": datetime.now().isoformat(timespec="seconds")}
        self.cards[cid] = card
        self._save()
        return card

    def discard(self, cid: str) -> None:
        self.cards.pop(cid, None)
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.cards, ensure_ascii=False, indent=1), encoding="utf-8")
