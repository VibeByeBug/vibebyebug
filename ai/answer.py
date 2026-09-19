"""추천 답변 - 실전 질문에 발표자가 읽을 답변을 그 자리에서 만든다.

키워드만으로는 말을 만들기 어렵다는 QA 결과로 넣었다. 회의나 업무 자리처럼
발표자가 자료를 외우고 있지 않은 상황에서는 답변 문장이 있어야 쓸 수 있다.

키워드와 근거는 pipeline.cue() 가 먼저 띄운다. 답변은 그 뒤에 따라온다.
느린 모델 호출이 키워드를 붙잡으면 안 되기 때문이다.

미리 만든 모범 답변(mock_defense.add_answers)을 실전 질문에 붙이는 방식은 버렸다.
예상 질문 20개로는 실전 질문을 못 덮어서, 가장 비슷한 걸 고르면 틀린 답변이 떴다.
  같은 슬라이드 + 낱말 겹침   "어떤 API 를 쓰셨나요?" 에 "실패한 건 제외 기준" 답변
  핵심 숫자 포함 확인         14개 띄워서 6개 정도만 맞음
  임베딩(e5, BGE-M3)          틀린 짝 점수가 맞는 짝보다 높음
  리랭커(bge-reranker-base)   한국어를 못 읽고 질문당 2.6초
모범 답변은 연습 화면에서만 쓴다.

지어낸 답변을 막는 장치 세 가지.
  1. 검색된 슬라이드 내용만 주고 그 안에서만 답하게 한다.
  2. 근거 없음 / 잡음 판정이 난 질문은 모델을 부르지 않는다.
  3. 문장이 끝날 때마다 숫자를 슬라이드와 대조한다. 슬라이드에 없는 숫자가 나오면
     그 문장부터 버리고 멈춘다. 화면에 한 번 뜬 숫자는 되돌릴 수 없어서 문장 단위로 검사한다.
"""

from __future__ import annotations

import queue
import re
import threading
import time
from typing import Iterator

from caption import load_env

MODEL = "gpt-5.4-mini"
# none 은 "그 외에 사용한 API는 없음입니다" 같은 어색한 문장이 섞였다. low 가 첫 글자 1.1~1.7초.
REASONING = "low"
# 이보다 늦은 답변은 발표자가 이미 말을 시작한 뒤라 쓸모가 없다.
# 클라이언트 timeout 만 걸었더니 스트리밍에서는 안 먹어서 60초를 기다린 적이 있다.
DEADLINE_S = 8.0

PROMPT = """발표자가 청중 질문에 바로 읽을 수 있는 답변을 2문장으로 써줘.

지켜야 할 것:
1. 아래 자료 내용만 근거로 써. 자료에 없는 사실, 숫자, 이름은 절대 지어내지 마.
   여러 슬라이드를 이어서 답해도 된다. 발표 줄거리가 있으면 질문이 그 흐름의 어디에 해당하는지 보고 앞뒤 슬라이드를 연결해.
   [발표자 설명] 과 [프로젝트 설명] 은 발표자가 직접 준 설명이라 근거로 써도 된다. 슬라이드 번호는 그 설명이 붙은 슬라이드(없으면 0).
2. 숫자는 자료에 적힌 그대로 옮겨. 반올림, 단위 변환, 재계산 금지.
3. 자료가 보여주는 것보다 세게 단정하지 마. 확인하지 않은 것을 했다고 하지 말고, 한계가 있으면 인정해.
4. 첫 문장에서 바로 답해. 인사말 금지. 문장은 짧게.
5. 발표자 본인이 말하는 존댓말로 써. "슬라이드에서는", "자료에 따르면" 같은 말은 쓰지 마.
   분석한 사실은 과거형으로, 제안이나 방법은 "~해야 합니다", "~할 수 있습니다" 로.
6. 굵은 글씨, 목록 기호 같은 서식 없이 평문으로.
7. 자료로 답할 수 없으면 "없음" 이라고만 써.

질문: {question}
{story}
--- 자료 ---
{slides}"""

_NUM = re.compile(r"\d+(?:[.,]\d+)*")
_SENT_END = re.compile(r"(?<=[.!?])\s+")


def _story_block(story: str) -> str:
    """논리 지도의 발표 줄거리. 없으면 빈 줄."""
    if not story:
        return ""
    return f"\n--- 발표 줄거리 (어느 단계의 질문인지 볼 때만 쓴다. 근거는 아래 자료에서) ---\n{story}\n"


def _fmt_slides(slides: list[tuple[int, str]]) -> str:
    """모델에 넘길 자료. 0번은 특정 슬라이드가 아닌 프로젝트 설명이다."""
    return "\n\n".join((f"[{p}번 슬라이드]\n{t}" if p else f"[프로젝트 설명 (슬라이드 번호 0)]\n{t}")
                       for p, t in slides)


def numbers_ok(text: str, source: str) -> bool:
    """문장에 나온 숫자가 전부 자료에 있는가. mock_defense.answer_ok 와 같은 기준."""
    src = re.sub(r"[\s,]", "", source)
    return all(n.replace(",", "") in src for n in _NUM.findall(text))


def _clean(s: str) -> str:
    return re.sub(r"\*\*|__|`", "", s).strip()


class Answerer:
    def __init__(self, model: str = MODEL):
        self.model = model
        self._client = None

    def ready(self) -> bool:
        """키가 있어서 부를 수 있는가."""
        import os
        load_env()
        return bool(os.environ.get("OPENAI_API_KEY"))

    def _get(self):
        if self._client is None:
            from openai import OpenAI
            load_env()
            self._client = OpenAI(timeout=DEADLINE_S, max_retries=0)
        return self._client

    def warm(self) -> float:
        """연결을 미리 열어둔다. 안 하면 첫 질문만 7.9초가 걸렸다(연결 수립 비용)."""
        if not self.ready():
            return 0.0
        t0 = time.time()
        try:
            self._get().chat.completions.create(
                model=self.model, reasoning_effort="none", max_completion_tokens=16,
                messages=[{"role": "user", "content": "ok"}])
        except Exception:
            pass          # 준비 실패로 발표를 막지 않는다. 실전 호출에서 다시 시도된다.
        return time.time() - t0

    def stream(self, question: str, slides: list[tuple[int, str]], story: str = "") -> Iterator[dict]:
        """검사를 통과한 문장이 나올 때마다 지금까지의 답변을 내보낸다.

        마지막 메시지는 done=True 이고 status 가 붙는다.
          ok       답변 완료
          no_answer  모델이 자료로 답할 수 없다고 함
          blocked  자료에 없는 숫자가 나와서 그 문장부터 버림 (앞 문장은 남김)
          error    키 없음, 시간 초과 등
        """
        t0 = time.time()
        source = "\n\n".join(t for _, t in slides)
        prompt = PROMPT.format(
            question=question, story=_story_block(story),
            slides=_fmt_slides(slides))

        shown: list[str] = []
        first_ms = None

        def msg(done: bool, status: str = "", note: str = "") -> dict:
            m = {"type": "cue.answer", "text": " ".join(shown), "done": done,
                 "latency_ms": round((time.time() - t0) * 1000, 1)}
            if done:
                m.update(status=status, first_ms=first_ms)
                if note:
                    m["note"] = note
            return m

        if not self.ready():
            yield msg(True, "error", "OPENAI_API_KEY 가 없습니다")
            return

        # 모델 호출은 작업 스레드에서 돌리고 여기서는 큐만 기다린다.
        # 연결을 다른 스레드에서 닫는 방식은 윈도우에서 읽기가 안 풀려 0.6초 제한에 9.8초가 걸렸다.
        q: queue.Queue = queue.Queue()
        cancel = threading.Event()

        def work():
            try:
                resp = self._get().chat.completions.create(
                    model=self.model, stream=True, reasoning_effort=REASONING,
                    messages=[{"role": "user", "content": prompt}])
                for chunk in resp:
                    if cancel.is_set():
                        resp.close()
                        return
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        q.put(("delta", delta))
                q.put(("end", None))
            except Exception as e:
                q.put(("error", type(e).__name__))

        threading.Thread(target=work, daemon=True).start()

        buf = ""
        while True:
            left = DEADLINE_S - (time.time() - t0)
            try:
                kind, val = q.get(timeout=max(left, 0.0)) if left > 0 else q.get_nowait()
            except queue.Empty:
                cancel.set()
                # 이미 띄운 문장은 검사를 통과했으니 두고, 끊긴 반쪽 문장은 버린다
                yield msg(True, "ok" if shown else "error", "timeout")
                return
            if kind == "error":
                yield msg(True, "error", val)
                return
            if kind == "end":
                break
            buf += val
            parts = _SENT_END.split(buf)
            buf = parts.pop()               # 아직 안 끝난 문장
            for sent in parts:
                sent = _clean(sent)
                if not sent:
                    continue
                if not numbers_ok(sent, source):
                    cancel.set()
                    yield msg(True, "blocked", sent)
                    return
                shown.append(sent)
                if first_ms is None:
                    first_ms = round((time.time() - t0) * 1000, 1)
                yield msg(False)

        last = _clean(buf)
        if last.strip("\"' .") == "없음" and not shown:
            yield msg(True, "no_answer")
            return
        if last:
            if not numbers_ok(last, source):
                yield msg(True, "blocked", last)
                return
            shown.append(last)
            if first_ms is None:
                first_ms = round((time.time() - t0) * 1000, 1)
        yield msg(True, "ok" if shown else "no_answer")


# ── 흐름도 모드 ──────────────────────────────────────────────────────────
# 추천 답변은 그대로 읽게 되고, 키워드는 순서를 발표자가 짜야 해서 도움이 약하다는 의견이 나왔다.
# 말할 순서만 짧은 칸 3개로 보여준다. 칸마다 근거 슬라이드를 붙이고 숫자를 그 슬라이드와 대조한다.

FLOW_STEPS = 3
FLOW_MAX_CHARS = 22

FLOW_SHAPE = {
    "사실확인": "1칸 질문에 대한 답(수치나 이름) → 2칸 그 수치의 출처나 조건 → 3칸 덧붙이면 좋은 사실",
    "절차":     "1칸 첫 단계 → 2칸 다음 단계 → 3칸 마지막 단계나 결과",
    "근거":     "1칸 주장이나 결론 → 2칸 뒷받침 수치 → 3칸 검증한 방법",
    "한계반론": "1칸 한계를 인정하는 말 → 2칸 이 분석이 다루는 범위 → 3칸 그래도 결론이 유효한 이유",
}

# 화살표에 붙일 연결어. 모델이 매번 다른 말을 지어내면 발표자가 읽고 해석해야 해서 목록에서만 고른다.
# 이 말을 그대로 입으로 말하면 칸과 칸이 문장으로 이어진다.
LINKS = ("그래서", "근거는", "즉", "예를 들어", "다만", "그럼에도", "덧붙이면",
         "그 결과", "다음으로", "마지막으로", "왜냐하면", "검증은")
DEFAULT_LINKS = {
    "사실확인": ("근거는", "덧붙이면"),
    "절차":     ("다음으로", "마지막으로"),
    "근거":     ("근거는", "검증은"),
    "한계반론": ("다만", "그럼에도"),
}
GUIDE_MAX = 90
WHY_MAX = 18          # 화살표 아래 연결 논리. 길면 칸보다 눈에 띈다

FLOW_PROMPT = """발표자가 청중 질문에 답할 때 말할 순서를 흐름도 칸 {n}개로 만들어줘.
발표자는 이걸 한 번 보고 자기 말로 풀어서 답한다. 문장이 아니라 짧은 메모다.

흐름: {shape}

지켜야 할 것:
1. 한 칸은 {max_chars}자 이내. 조사와 어미를 빼고 명사형으로 끝내.
2. 아래 자료 내용만 근거로 써. 자료에 없는 사실, 숫자, 이름은 절대 지어내지 마.
   여러 슬라이드를 이어서 답해도 된다. 발표 줄거리가 있으면 질문이 그 흐름의 어디에 해당하는지 보고 앞뒤 슬라이드를 연결해.
   [발표자 설명] 과 [프로젝트 설명] 은 발표자가 직접 준 설명이라 근거로 써도 된다. 슬라이드 번호는 그 설명이 붙은 슬라이드(없으면 0).
3. 숫자는 자료에 적힌 그대로. 반올림, 단위 변환, 재계산 금지.
4. 칸마다 근거가 된 슬라이드 번호를 붙여.
5. 칸마다 핵심 단어 하나를 골라. 칸 내용에 그대로 들어 있는 말이어야 한다 (수치가 있으면 수치).
6. 칸마다 다음 칸으로 넘어갈 때 말할 연결어를 이 중에서 하나 골라: {links}. 마지막 칸은 "-".
7. 칸마다 다음 칸으로 왜 이어지는지 논리를 {why_max}자 이내로 적어. 어떤 관계인지가 보여야 한다.
   예: "500명×9,900원 계산", "그 목표의 전제 조건", "같은 기준으로 비교". 마지막 칸은 "-". 자료에 없는 숫자는 쓰지 마.
8. 마지막 줄에 답변 가이드를 한 줄 써. 답변 문장이 아니라 "어떤 순서로, 어느 슬라이드를 근거로 말하면 되는지" 알려주는 코칭이다.
   예: "결론인 구독자 수부터 말하고, 12번 슬라이드 매출 계산으로 근거를 댄 뒤 2년 차 목표라는 조건을 덧붙이세요"
   {guide_max}자 이내. 자료에 없는 숫자는 쓰지 마.
9. 자료로 답할 수 없으면 "없음" 한 줄만 써.

출력 형식 (다른 말 붙이지 말고 이것만):
슬라이드번호 | 칸 내용 | 핵심 단어 | 연결어 | 연결 논리
12 | 구독 500명 기준 | 500명 | 그래서 | 500명×9,900원 계산
12 | 월 매출 495만원 | 495만원 | 즉 | 고정비를 넘는 시점
18 | 2년 차 흑자 전환 | 흑자 전환 | - | -
가이드 | 답변 가이드

질문: {question}
{story}
--- 자료 ---
{slides}"""

_FLOW_LINE = re.compile(r"^\D{0,8}?(\d{1,3})\s*(?:\t|\||:|\)|번|\.)\s*(.+)$")


def _drop_slide_refs(text: str) -> str:
    """ "12번 슬라이드", "p.12", "슬라이드 12" 같은 슬라이드 번호를 지운다(숫자 검사용)."""
    text = re.sub(r"\d{1,3}\s*번\s*(?:슬라이드|장)", "", text)
    return re.sub(r"(?:p\.?\s*|슬라이드\s*)\d{1,3}", "", text)


def _stream_text(self, prompt: str, t0: float) -> Iterator[tuple[str, str]]:
    """모델 출력을 줄 단위로 내보낸다. ("line", 줄) / ("end", 남은 글자) / ("error", 이유)"""
    q: queue.Queue = queue.Queue()
    cancel = threading.Event()

    def work():
        try:
            resp = self._get().chat.completions.create(
                model=self.model, stream=True, reasoning_effort=REASONING,
                messages=[{"role": "user", "content": prompt}])
            for chunk in resp:
                if cancel.is_set():
                    resp.close()
                    return
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    q.put(("delta", delta))
            q.put(("end", None))
        except Exception as e:
            q.put(("error", type(e).__name__))

    threading.Thread(target=work, daemon=True).start()
    buf = ""
    try:
        while True:
            left = DEADLINE_S - (time.time() - t0)
            try:
                kind, val = q.get(timeout=left) if left > 0 else q.get_nowait()
            except queue.Empty:
                yield ("error", "timeout")
                return
            if kind == "error":
                yield ("error", val)
                return
            if kind == "end":
                yield ("end", buf)
                return
            buf += val
            *lines, buf = buf.split("\n")
            for line in lines:
                if line.strip():
                    yield ("line", line)
    finally:
        cancel.set()


def flow(self, question: str, qtype: str, slides: list[tuple[int, str]], story: str = "") -> Iterator[dict]:
    """칸이 완성될 때마다 지금까지의 흐름도를 내보낸다.

    {"type": "cue.flow", "steps": [{"text", "slide", "key", "link"}], "guide", "done", "latency_ms", "status"}
    key 는 칸에서 색으로 강조할 핵심 단어, link 는 다음 칸으로 넘어가는 연결어, guide 는 답변 가이드
    status: ok | no_answer | blocked | error  (blocked 는 자료에 없는 숫자가 나온 칸부터 버림)
    """
    t0 = time.time()
    by_slide = dict(slides)
    all_text = "\n".join(by_slide.values())
    steps: list[dict] = []
    guide = ""
    first_ms = None
    defaults = DEFAULT_LINKS.get(qtype, DEFAULT_LINKS["사실확인"])

    def msg(done: bool, status: str = "", note: str = "") -> dict:
        # 연결어는 칸 사이에만 있다. 마지막 칸의 연결어는 비운다.
        out = [dict(st, link=st["link"] if i < len(steps) - 1 else "",
                    why=st.get("why", "") if i < len(steps) - 1 else "") for i, st in enumerate(steps)]
        m = {"type": "cue.flow", "steps": out, "guide": guide, "done": done,
             "latency_ms": round((time.time() - t0) * 1000, 1)}
        if done:
            m.update(status=status, first_ms=first_ms)
            if note:
                m["note"] = note
        return m

    if not self.ready():
        yield msg(True, "error", "OPENAI_API_KEY 가 없습니다")
        return

    prompt = FLOW_PROMPT.format(
        n=FLOW_STEPS, max_chars=FLOW_MAX_CHARS, question=question, story=_story_block(story),
        shape=FLOW_SHAPE.get(qtype, FLOW_SHAPE["사실확인"]),
        links=", ".join(LINKS), guide_max=GUIDE_MAX, why_max=WHY_MAX,
        slides=_fmt_slides(slides))

    def take(line: str):
        """한 줄을 칸으로 만든다. 반환: 칸 dict / "skip" / "blocked" / "none" """
        s = _clean(line)
        if s.strip("\"' .") == "없음":
            return "none"
        g = re.match(r"^\W*가이드\s*[|:]\s*(.+)$", s)
        if g:
            return {"guide": g.group(1).strip().strip("\"'")}
        m = _FLOW_LINE.match(s)
        if not m:
            return "skip"
        slide, rest = int(m.group(1)), m.group(2)
        parts = [x.strip().strip("\"'") for x in rest.split("|")]
        text = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        link = parts[2] if len(parts) > 2 else ""
        why = parts[3] if len(parts) > 3 else ""
        # 연결 논리도 숫자를 자료와 대조한다. 틀린 숫자면 설명만 버린다(칸은 살린다).
        if why in ("-", "") or not numbers_ok(_drop_slide_refs(why), "\n".join(by_slide.values())):
            why = ""
        # 형식 지시어가 칸에 섞여 나오는 경우가 있었다 ("슬라이드	과정 채점", "<TAB>문제마다...")
        text = re.sub(r"^(?:슬라이드|<?TAB>?|\||\s)+", "", text).strip()
        if not text:
            return "skip"
        if slide not in by_slide:
            # 주지 않은 슬라이드 번호는 지어낸 것이다
            return "skip"
        if not numbers_ok(text, by_slide[slide]):
            return "blocked"
        text = text[:FLOW_MAX_CHARS + 8]
        # 핵심 단어는 칸 안에 그대로 있어야 색을 칠할 수 있다. 없으면 칸의 수치로 대신한다.
        if not key or key not in text:
            num = re.search(r"\d[\d,.~]*\s*(?:%|[가-힣]{1,2})?", text)
            key = num.group(0).strip() if num else ""
        return {"text": text, "slide": slide, "key": key, "link": link if link in LINKS else "",
                "why": why[:WHY_MAX + 6]}

    for kind, val in _stream_text(self, prompt, t0):
        if kind == "error":
            yield msg(True, "ok" if steps else "error", val)
            return
        pending = [val] if kind == "line" else ([val] if val.strip() else [])
        for line in pending:
            got = take(line)
            if got == "none" and not steps:
                yield msg(True, "no_answer")
                return
            if got == "blocked":
                yield msg(True, "blocked", line)
                return
            if isinstance(got, dict) and "guide" in got:
                # 가이드도 숫자를 자료와 대조한다. 틀린 숫자가 있으면 가이드만 버린다.
                # "12번 슬라이드" 의 12 는 슬라이드 번호라 자료 본문에 없다. 이걸 틀린 숫자로 보고
                # 가이드를 버리는 일이 잦았다. 슬라이드 번호는 빼고 대조한다.
                if numbers_ok(_drop_slide_refs(got["guide"]), all_text):
                    guide = got["guide"][:GUIDE_MAX + 10]
                    yield msg(False)
                continue
            if isinstance(got, dict) and len(steps) < FLOW_STEPS:
                # 모델이 목록 밖 연결어를 쓰면 유형별 기본값으로 채운다
                if not got["link"] and len(steps) < len(defaults):
                    got["link"] = defaults[len(steps)]
                steps.append(got)
                if first_ms is None:
                    first_ms = round((time.time() - t0) * 1000, 1)
                yield msg(False)
        if kind == "end":
            break
    yield msg(True, "ok" if steps else "no_answer")


Answerer.flow = flow
