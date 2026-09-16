"""모의 디펜스 — 발표 전에 예상 질문으로 연습하고, 무엇을 놓쳤는지 판정한다.

계획서의 [사전] 단계다. 실전과 달리 발표 시작 전에 도므로 느려도 된다.

두 부분으로 나뉘고, 성격이 다르다.

  질문 생성  : 자연스러운 질문을 만들어야 하므로 모델이 필요하다. 오프라인이라 느려도 된다.
  커버리지 판정: 모델이 필요 없다. 근거 줄에서 뽑은 수치·핵심어가 발표자 답변에
               나왔는지 대조하면 된다. 지어낼 여지가 없어야 하는 자리라 규칙이 맞다.

사용:
    python mock_defense.py gen  data/chunks_x.jsonl -o data/expected_x.jsonl
    python mock_defense.py drill data/chunks_x.jsonl data/expected_x.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from caption import PROVIDERS, detect_provider, load_env, _retry_delay
from pipeline import ReadyQ, Nouns, _idf, _is_number, _useful_number, STOP
from weak_profile import WeakProfile, DEFAULT_PATH

# 유형별로 따로 뽑는다. 한꺼번에 시키면 사실확인만 잔뜩 나온다 - 실제로 그런 편향이 있었다.
TYPE_BRIEF = {
    "사실확인": "슬라이드에 적힌 수치나 출처를 확인하는 질문. 답이 숫자나 이름 하나로 나오는 것.",
    "절차":     "어떤 순서로, 어떤 기준으로 했는지 방법을 묻는 질문.",
    "근거":     "왜 그렇게 판단했는지, 그 결론을 믿을 근거가 뭔지 묻는 질문.",
    "한계반론": "약점을 찌르는 질문. 빠진 것, 못 하는 것, 다른 해석 가능성을 묻는 것.",
}

PROMPT = """아래는 어떤 발표의 슬라이드 내용이야. 슬라이드마다 번호가 붙어 있어.

발표가 끝나고 청중이나 심사위원이 물어볼 법한 **{qtype}** 질문을 {n}개 만들어줘.

{qtype} 질문이란: {brief}

지켜야 할 것:
1. 슬라이드에 있는 문장을 그대로 베끼지 마. 말로 풀어서 물어봐.
2. 답이 되는 숫자를 질문에 넣지 마. 그 숫자를 물어보는 질문을 만들어.
   나쁜 예: "94,469건이 맞나요?"   좋은 예: "포트홀 데이터는 얼마나 모으신 거죠?"
3. 실제 말투로. "~인가요?", "~좀 설명해주세요" 같은 구어체.
4. 서로 다른 슬라이드를 근거로 하는 질문을 골고루.
5. 표지나 '감사합니다' 슬라이드는 건너뛰어.

출력 형식 (다른 말 붙이지 말고 이것만):
슬라이드번호<TAB>질문

--- 슬라이드 내용 ---
{slides}"""


FOLLOWUP_PROMPT = """발표 심사위원이 되어 꼬리질문을 만들어줘.

아래는 질문 목록이다. 각 줄은 [번호] 질문 / 발표자가 꼭 말해야 할 근거 순이다.
발표자가 그 근거를 말하지 않았을 때 **말하게 만드는** 되물음을 하나씩 만들어줘.

지켜야 할 것:
1. 답을 알려주지 마. 근거 자체를 질문에 넣으면 안 된다.
   나쁜 예: "41%가 맞나요?"      좋은 예: "그 비율이 구체적으로 얼마였죠?"
2. 한 문장. 실제 말투로.
3. 근거가 여러 개면 그중 가장 중요한 하나를 겨냥해.

출력 형식 (다른 말 붙이지 말고 이것만):
번호<TAB>꼬리질문

--- 질문 목록 ---
{items}"""


@dataclass
class Coverage:
    question: str
    answer: str
    gold_slide: int
    facts: list[str]          # 근거 줄에서 뽑은 핵심 요소
    covered: list[str]        # 그중 답변에 나온 것
    missed: list[str]         # 안 나온 것
    snippet: str
    elsewhere: list[str] = None   # 고른 줄 밖이지만 같은 슬라이드에 있는 수치

    @property
    def ratio(self) -> float:
        return len(self.covered) / len(self.facts) if self.facts else 1.0

    @property
    def off_line(self) -> bool:
        """근거는 댔는데 우리가 고른 줄이 아니었던 경우."""
        return bool(self.elsewhere) and self.ratio < 0.5


# ── 질문 생성 (모델 필요) ────────────────────────────────────────────────

def _call(prompt: str, provider: str, model: str) -> str:
    if provider == "gemini":
        from google import genai
        client = genai.Client()
        return client.models.generate_content(model=model, contents=prompt).text or ""
    if provider == "anthropic":
        import anthropic
        r = anthropic.Anthropic().messages.create(
            model=model, max_tokens=4000, messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in r.content if b.type == "text")
    from openai import OpenAI
    r = OpenAI().chat.completions.create(
        model=model, max_tokens=4000, messages=[{"role": "user", "content": prompt}])
    return r.choices[0].message.content or ""


def _call_retry(prompt: str, provider: str, model: str, attempts: int = 6) -> str:
    for i in range(attempts):
        try:
            return _call(prompt, provider, model)
        except Exception as e:
            wait = _retry_delay(e)
            if wait is None or i == attempts - 1:
                raise
            print(f"    제한/혼잡 — {max(wait, 2.0*(i+1)):.0f}초 대기", flush=True)
            time.sleep(max(wait, 2.0 * (i + 1)))
    return ""


def _parse(out: str, valid: set[int]) -> list[tuple[int, str]]:
    rows = []
    for line in out.splitlines():
        line = line.strip()
        m = re.match(r"^\D{0,3}(\d{1,3})\s*(?:\t|\||:|\.|\)|\s{2,})\s*(.+)$", line)
        if not m:
            continue
        page, q = int(m.group(1)), m.group(2).strip()
        # 모델이 없는 슬라이드 번호를 지어내면 버린다
        if page in valid and len(q) >= 8:
            rows.append((page, q))
    return rows


def generate(chunks: Path, out: Path, per_type: int, min_chars: int,
             provider: str, model: str) -> int:
    rows = [json.loads(l) for l in chunks.open(encoding="utf-8")]
    targets = [r for r in rows if r["n_chars"] >= min_chars]
    valid = {r["page"] for r in targets}
    by_page = {r["page"]: r for r in rows}
    slides = "\n\n".join(f"[슬라이드 {r['page']}]\n{r['text']}" for r in targets)

    print(f"[예상 질문 생성] 슬라이드 {len(targets)}장 · 유형별 {per_type}개 · {provider}/{model}")
    print(f"  유형마다 호출 1회, 총 {len(TYPE_BRIEF)}회")

    made = []
    for qtype, brief in TYPE_BRIEF.items():
        prompt = PROMPT.format(qtype=qtype, brief=brief, n=per_type, slides=slides)
        try:
            got = _parse(_call_retry(prompt, provider, model), valid)
        except Exception as e:
            print(f"  {qtype}: 실패 — {e}", file=sys.stderr)
            continue
        for page, q in got[:per_type]:
            made.append({"question": q, "qtype": qtype, "gold_page": page,
                         "gold_id": by_page[page]["id"]})
        print(f"  {qtype}: {len(got[:per_type])}개")

    if not made:
        print("생성된 질문이 없습니다", file=sys.stderr)
        return 4

    # 꼬리질문을 여기서 미리 만든다.
    # 연습 중에 만들면 발표자가 화면 앞에서 기다리는 동안 모델을 부르게 된다.
    # 무료 등급 속도 제한에 걸려 질문 하나에 몇 분씩 멈췄다. 호출도 한 번으로 묶는다.
    print()
    print("[꼬리질문 미리 생성] 호출 1회")
    from pipeline import ReadyQ, _idf
    rq = ReadyQ(chunks, preset="fast")
    idf = _idf(rq.rows, rq.nouns)
    for m in made:
        c = judge("", m["question"], m["gold_page"], rq, idf)
        m["facts"] = c.facts
        m["snippet"] = c.snippet

    items = chr(10).join(
        f"[{i}] {m['question']} / 근거: {', '.join(m['facts'][:4])}"
        for i, m in enumerate(made, 1) if m["facts"])
    try:
        raw = _call_retry(FOLLOWUP_PROMPT.format(items=items), provider, model)
        got = {}
        for line in raw.splitlines():
            mt = re.match(r"^\D{0,3}(\d{1,3})\s*(?:	|\||:|\.|\))\s*(.+)$", line.strip())
            if mt:
                got[int(mt.group(1))] = mt.group(2).strip()
    except Exception as e:
        print(f"  실패 — 연습 때 템플릿을 쓴다: {e}", file=sys.stderr)
        got = {}

    leaked = 0
    for i, m in enumerate(made, 1):
        q = got.get(i, "")
        # 답을 흘렸으면 버린다. 연습이 안 되는 꼬리질문은 없느니만 못하다.
        if q and any(_norm(f) in _norm(q) for f in m.get("facts", [])):
            leaked += 1
            q = ""
        m["followup"] = q
    ok = sum(1 for m in made if m.get("followup"))
    print(f"  {ok}/{len(made)}개 준비" + (f" (답 유출로 버린 것 {leaked}개)" if leaked else ""))

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for m in made:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"\n  질문 {len(made)}개 -> {out}")
    return 0


# ── 커버리지 판정 (모델 불필요) ──────────────────────────────────────────

# 근거로 세기엔 너무 흔한 말. 발표자에게 "'대신'을 안 말했다"고 알려줘봐야 쓸모가 없다.
GENERIC = {
    "실제", "성능", "영상", "사진", "대신", "지점", "반복", "사용", "확인", "적용",
    "분석", "데이터", "결과", "경우", "중심", "기준", "대상", "전체", "일부", "이후",
    "지역", "구역", "발생", "수행", "진행", "가능", "필요", "포함", "선정", "산출",
}
MIN_IDF = 1.6      # 이보다 흔하면 근거로 안 센다


def key_facts(line: str, nouns: Nouns, idf: dict, n: int = 6) -> list[str]:
    """근거 줄에서 '답변에 나왔어야 할 것'을 뽑는다.

    수치를 먼저 넣는다. Q&A 에서 놓치면 치명적인 건 대개 숫자다.
    나머지 명사는 흔하지 않은 것만 넣는다 - 커버리지의 분모가 되므로,
    흔한 말이 섞이면 잘 답해도 점수가 낮게 나와 판정이 무의미해진다.
    """
    toks = nouns(line)
    facts, seen = [], set()

    def add(w):
        k = w.lower()
        if k not in seen:
            seen.add(k)
            facts.append(w)

    for w in toks:                       # 1) 수치 먼저, 등장 순서대로
        if _is_number(w) and _useful_number(w):
            add(w)

    rest = []
    for w in toks:
        k = w.lower()
        if k in seen or _is_number(w) or len(w) < 2:
            continue
        if w in STOP or w in GENERIC:
            continue
        # 원문에서 앞이나 뒤에 글자가 붙어 있으면 더 긴 말의 조각이다.
        # ('무작위' -> '작위', '서브셋' -> '서브', 'AI-Hub' -> 'Hub')
        esc = re.escape(w)
        if re.search(r"[가-힣A-Za-z\-]" + esc, line) or re.search(esc + r"[가-힣]", line):
            continue
        score = idf.get(k, 0.0)
        if score < MIN_IDF:
            continue
        rest.append((score, w))
    rest.sort(key=lambda x: -x[0])
    for _, w in rest:
        if len(facts) >= n:
            break
        add(w)
    return facts


def _norm(s: str) -> str:
    return re.sub(r"[\s,]", "", s).lower()


def judge(answer: str, question: str, gold_page: int, rq: ReadyQ,
          idf: dict) -> Coverage:
    """발표자 답변이 근거를 얼마나 담았는지 본다."""
    row = next((r for r in rq.rows if r["page"] == gold_page), None)
    if row is None:
        return Coverage(question, answer, gold_page, [], [], [], "")

    i = rq.rows.index(row)
    qwords = {w.lower() for w in rq.nouns(question)}
    from pipeline import _best_line
    line = _best_line(rq.prepared[i], qwords, "사실확인", rq.idf) or row["text"][:120]

    facts = key_facts(line, rq.nouns, idf)
    na = _norm(answer)
    covered = [f for f in facts if _norm(f) in na]
    missed = [f for f in facts if f not in covered]

    # 표 슬라이드는 행이 여럿이다. 질문으로 고른 줄과 다른 행을 근거로 답했어도
    # 슬라이드 안의 내용이면 틀린 게 아니다. 이걸 오답으로 세면 판정이 거짓말을 한다.
    elsewhere = []
    if missed:
        slide_norm = _norm(row["text"])
        for w in rq.nouns(answer):
            if _is_number(w) and _useful_number(w) and _norm(w) in slide_norm                     and _norm(w) not in _norm(line):
                elsewhere.append(w)

    return Coverage(question, answer, gold_page, facts, covered, missed, line,
                    elsewhere)


def drill(chunks: Path, questions: Path, shuffle: bool, limit: int) -> int:
    qs = [json.loads(l) for l in questions.open(encoding="utf-8")]
    if shuffle:
        random.shuffle(qs)
    qs = qs[:limit] if limit else qs

    print("모의 디펜스를 시작합니다. 질문에 소리 내어 답하듯 적어보세요.")
    print("(엔터만 치면 건너뜁니다. Ctrl+C 로 종료)\n")

    rq = ReadyQ(chunks, preset="fast")     # 판정은 실시간이 아니므로 가벼운 걸로 충분
    idf = _idf(rq.rows, rq.nouns)
    # 이번 연습에서 무엇을 놓쳤는지 쌓는다. 실전 화면이 이걸 읽는다.
    weak = WeakProfile.load(DEFAULT_PATH)

    results = []
    for n, q in enumerate(qs, 1):
        print(f"[{n}/{len(qs)}] ({q['qtype']}) {q['question']}")
        try:
            ans = input("  > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n중단합니다.")
            break
        if not ans:
            print("  건너뜀\n")
            continue
        c = judge(ans, q["question"], q["gold_page"], rq, idf)
        results.append(c)
        weak.record(q["gold_page"], q["qtype"], c.facts, c.covered)
        bar = "#" * int(c.ratio * 10)
        print(f"  커버리지 {c.ratio:.0%} {bar}")
        if c.missed:
            print(f"  놓친 것: {', '.join(c.missed)}")
        print(f"  근거 (p{c.gold_slide}): {c.snippet[:90]}\n")

    if not results:
        return 0
    weak.save(DEFAULT_PATH)
    avg = sum(c.ratio for c in results) / len(results)
    print("=" * 60)
    print(f"답한 질문 {len(results)}개 · 평균 커버리지 {avg:.0%}")
    print(f"약점 기록 -> {DEFAULT_PATH} (연습 {weak.sessions}회 누적)")
    print("  실전에서 이 근거들이 키워드 앞쪽에 오게 된다.")
    weak = sorted(results, key=lambda c: c.ratio)[:3]
    if weak and weak[0].ratio < 1.0:
        print("\n약했던 질문:")
        for c in weak:
            if c.ratio < 1.0:
                print(f"  {c.ratio:>4.0%}  {c.question[:44]}")
                print(f"        놓침: {', '.join(c.missed)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("gen", help="예상 질문 생성")
    g.add_argument("chunks", type=Path)
    g.add_argument("-o", "--output", type=Path, default=Path("data/expected.jsonl"))
    g.add_argument("--per-type", type=int, default=5)
    g.add_argument("--min-chars", type=int, default=150)
    g.add_argument("--provider", choices=list(PROVIDERS), default=None)
    g.add_argument("--model", default=None)

    d = sub.add_parser("drill", help="모의 디펜스 진행")
    d.add_argument("chunks", type=Path)
    d.add_argument("questions", type=Path)
    d.add_argument("--shuffle", action="store_true")
    d.add_argument("--limit", type=int, default=0)

    a = ap.parse_args()
    if a.cmd == "drill":
        return drill(a.chunks, a.questions, a.shuffle, a.limit)

    load_env()
    provider = a.provider or detect_provider()
    if provider is None:
        print("API 키가 없습니다. ai/.env 에 넣으세요.", file=sys.stderr)
        return 2
    return generate(a.chunks, a.output, a.per_type, a.min_chars,
                    provider, a.model or PROVIDERS[provider][1])


if __name__ == "__main__":
    raise SystemExit(main())
