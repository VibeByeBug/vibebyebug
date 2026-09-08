"""Ready-Q 핫패스 — 질문 텍스트 하나가 들어오면 화면에 띄울 것을 돌려준다.

백엔드가 붙일 대상이 이 파일이다. STT 구현은 모른다. 텍스트만 받는다.

기다렸다 한 번에 준다. 처음엔 BM25 로 즉시 띄우고 정확한 결과로 갱신하는 2단계를
설계했는데, 실측해보니 갱신이 428ms 에 도착했고 8개 중 4개에서 1위 카드가 교체됐다.
428ms 는 발표자가 화면으로 눈을 옮기는 시간과 비슷하다 - 1단계를 읽을 틈도 없이
눈이 닿는 순간 내용이 바뀐다. 값은 못 하고 흔들림만 남는다.

그래서 단일 단계로 간다. 428ms 빈 화면은 사람이 '느리다'고 느끼는 구간에 한참 못 미친다.

키워드는 만들지 않고 뽑는다. 계획서의 '환각 방지'가 여기서 지켜진다.
슬라이드에 실제로 있는 줄을 고르고, 그 줄에서 명사만 꺼낼 뿐이다.
"""

from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path

from embedders import BM25, Hybrid, STEmbedder, _tokens
from qtype import classify
from weak_profile import WeakProfile

# 유형별로 슬라이드에서 '무엇을 보여줄지'가 다르다.
# 검색에 유형을 쓰는 건 실패했지만(README 참고), 무엇을 띄울지 고르는 데는 맞다.
LINE_PREF = {
    "사실확인": re.compile(r"\d"),
    "절차":     re.compile(r"[①②③④⑤]|규칙|순서|단계|먼저|→"),
    "근거":     re.compile(r"p\s*=|ρ|배 |%|검증|대조|유의"),
    "한계반론": re.compile(r"한계|아니라|제외|다만|가상|근사|못 |반영되지"),
}

# 한계반론 질문에 붙는 우회 화법. 답을 대신 만들지 않고 '말하는 방식'만 제안한다.
DEFLECT = [
    "그 부분은 저희도 한계로 보고 있습니다. 자료에 이렇게 적어뒀습니다 —",
    "정확히 답하려면 질문 범위를 조금 좁혀주실 수 있을까요?",
]

# ── 잡음 방어 ────────────────────────────────────────────────────────
# 헛기침, 현장 소음, 짧은 침묵에 검색이 돌면 엉뚱한 슬라이드가 뜬다.
# 발표자가 그걸 보고 헷갈리느니 아무것도 안 뜨는 게 낫다.
MIN_CHARS = 6          # 이보다 짧으면 질문으로 안 본다
MIN_NOUNS = 1          # 명사가 하나도 없으면 말이 아니다

# STT 가 잡음을 이런 걸로 옮기는 경우가 많다
FILLER = {"어", "음", "아", "그", "저", "네", "예", "응", "엄", "흠", "저기",
          "그니까", "그러니까", "뭐", "이제", "약간", "좀"}

# ── 근거 없음 ────────────────────────────────────────────────────────
# 검색 엔진은 무조건 상위 k 개를 돌려준다. 발표자료와 무관한 질문에도 뭔가 나온다.
# 질문에 쓰인 낱말이 발표자료에 아예 없으면 근거가 없는 것으로 본다.
# (문턱값은 실제 질문으로 재서 잡았다 - calibrate_guard.py 참고)
MIN_KNOWN_RATIO = 0.26

# 근거가 없을 때 발표자에게 제안할 말. 지어내지 않고 정해둔 문장만 쓴다.
NO_EVIDENCE_ADVICE = [
    "그 부분은 이번 분석 범위에 넣지 않았습니다.",
    "질문 의도를 조금만 더 구체적으로 말씀해주시겠어요?",
    "확인해서 따로 답변 드리겠습니다.",
]


def is_noise(text: str, nouns_fn) -> bool:
    """질문이 아니라 잡음인가."""
    t = (text or "").strip()
    if len(t) < MIN_CHARS:
        return True
    words = nouns_fn(t)
    if len(words) < MIN_NOUNS:
        return True
    # 명사가 있어도 전부 추임새면 잡음이다
    return all(w in FILLER for w in words)


def known_ratio(question: str, nouns_fn, idf: dict) -> float:
    """질문에 쓰인 낱말 중 발표자료에 실제로 있는 비율."""
    words = [w for w in nouns_fn(question) if w not in FILLER and len(w) >= 2]
    if not words:
        return 0.0
    known = sum(1 for w in words if w.lower() in idf)
    return known / len(words)


# 명사이긴 하나 화면에 띄워봐야 아무 정보도 주지 않는 말
STOP = {
    "경우", "위해", "통해", "대한", "때문", "여기", "거기", "정도", "부분", "다음",
    "이것", "그것", "저것", "우리", "저희", "자료", "내용", "결과", "방법", "사용",
    "첫째", "둘째", "셋째", "넷째", "이상", "이하", "가지", "관련", "기준",
}

# 명사 태그 + 숫자/외국어. 뒤에 오는 단위 명사와 합쳐 '3회', '1.47배'로 되살린다.
NOUN_TAGS = {"NNG", "NNP", "SL"}
NUM_TAG = "SN"
UNIT_TAGS = {"NNB", "NNG"}


# 2단계 검색기 프리셋. 어느 걸 쓸지는 STT 가 예산을 얼마나 쓰느냐로 정해진다.
#
# 문서 289장 / 질문 45개 / 질문 하나씩 측정 (2026-09-05):
#
#   이름        구성                R@3     p50     p95     색인
#   fast        BM25 만            80.0%   0.7ms   1.2ms     0초
#   balanced    BM25 + e5-small    88.9%   169ms   428ms    62초
#   accurate    BM25 + BGE-M3      93.3%   584ms  2215ms   721초
#
# 예산은 p50 이 아니라 p95 로 잡는다. 평균이 예산 안이어도 스무 번에 한 번 넘으면
# 발표 중에는 그게 사고다. accurate 는 p95 2.2초로 1초 예산의 두 배라 핫패스에서 못 쓴다.
PRESETS = {
    "fast":     None,                                 # 2단계 없음
    "balanced": "intfloat/multilingual-e5-small",
    "accurate": "BAAI/bge-m3",
}
DEFAULT_PRESET = "balanced"


@dataclass
class Source:
    slide: int
    snippet: str
    source: str


@dataclass
class Cue:
    question_type: str
    keywords: list[str] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    deflect: list[str] = field(default_factory=list)
    status: str = "ok"        # ok | ignored | no_evidence
    advice: list[str] = field(default_factory=list)  # 근거가 없을 때 할 말
    weak_type: bool = False   # 연습에서 이 유형에 약했나 (화면 강조용)
    stage: str = "fast"
    latency_ms: float = 0.0

    def to_message(self) -> dict:
        """백엔드 계약(cue.evidence)에 맞춘 형태."""
        d = asdict(self)
        d["type"] = "cue.evidence"
        return d


class Nouns:
    """형태소 분석으로 명사만 꺼낸다.

    정규식으로 조사를 자르는 방식은 '많았기', '찾도록', '둘째' 같은 동사·부사 조각을
    걸러내지 못했다. 화면에 뜨는 키워드라 이런 게 섞이면 바로 티가 난다.
    분석기는 문장당 1.4ms 라 핫패스에 부담이 없다(모델 로딩은 warm 에서 끝낸다).
    """

    def __init__(self):
        from kiwipiepy import Kiwi
        self.kiwi = Kiwi()

    def __call__(self, text: str) -> list[str]:
        out = []
        toks = self.kiwi.tokenize(text)
        i = 0
        while i < len(toks):
            t = toks[i]
            if t.tag == NUM_TAG:
                # 숫자 뒤 단위를 붙여 되살린다: 3 + 회 -> 3회, 41 + % -> 41%
                # % 는 기호(SW)로 나오므로 따로 받아야 한다. 발표자료엔 퍼센트가 도처에 있어
                # 이걸 놓치면 근거 판정이 통째로 틀린다.
                if i + 1 < len(toks) and (
                        (toks[i + 1].tag in UNIT_TAGS and len(toks[i + 1].form) <= 2)
                        or toks[i + 1].form in ("%", "㎡", "℃")):
                    out.append(t.form + toks[i + 1].form)
                    i += 2
                    continue
                out.append(t.form)
            elif t.tag in NOUN_TAGS and len(t.form) >= 2:
                # 영문 뒤 숫자를 붙인다: YOLOv + 8 -> YOLOv8
                if (t.tag == "SL" and i + 1 < len(toks) and toks[i + 1].tag == NUM_TAG
                        and len(toks[i + 1].form) <= 2):
                    out.append(t.form + toks[i + 1].form)
                    i += 2
                    continue
                out.append(t.form)
            i += 1
        return out


def _idf(rows, nouns: Nouns) -> dict:
    df = Counter()
    for r in rows:
        df.update(set(w.lower() for w in nouns(r["text"])))
    n = len(rows)
    return {w: math.log(1 + n / c) for w, c in df.items()}


def _is_number(w: str) -> bool:
    return bool(re.match(r"^\d", w))


def _useful_number(w: str) -> bool:
    """쪽번호·목차 숫자를 거른다. 실제 근거 수치는 자릿수가 크거나 단위가 붙는다."""
    return bool(re.search(r"[,\.]|%|\d{4,}", w)) or bool(re.match(r"^\d+\D", w))


HEADING = re.compile(r"^[\[\(<※★①-⑤]|^STEP\s|^\s*[-•]\s*$")


def split_lines(text: str) -> list[str]:
    return [l.strip() for l in text.split(chr(10)) if len(l.strip()) > 6]


def _best_line(prepared: list[tuple[str, set]], qwords: set, qtype: str, idf: dict) -> str:
    """슬라이드에서 화면에 띄울 한 줄을 고른다.

    prepared 는 (줄, 그 줄의 명사집합) 목록이다. 명사 분석은 색인 때 끝내둔다 -
    질의마다 다시 하면 슬라이드당 수십 ms 가 붙는다.
    """
    if not prepared:
        return ""
    pref = LINE_PREF.get(qtype)
    best, best_score = prepared[0][0], float("-inf")
    for i, (line, words) in enumerate(prepared):
        score = sum(idf.get(w, 0.0) for w in words & qwords)
        if pref and pref.search(line):
            score += 2.0
        # 제목·소제목은 근거가 아니다. 숫자가 있는 본문 줄이 화면에 쓸모 있다.
        if HEADING.match(line):
            score -= 2.5
        if i == 0 and len(line) < 30 and not re.search(r"\d", line):
            score -= 3.0
        if len(line) < 14:
            score -= 1.5
        if re.search(r"\d[\d,\.]*\s*(?:건|개|곳|장|회|명|배|%|위)", line):
            score += 1.2          # 수치가 든 줄은 근거로 쓰기 좋다
        score -= 0.004 * max(0, len(line) - 90)
        if score > best_score:
            best, best_score = line, score
    return best


def _keywords(words: list[str], qwords: set, idf: dict, n: int = 5,
              weak=None, page: int = 0) -> list[str]:
    """고른 줄에서 화면에 띄울 말을 뽑는다. 만들지 않고 뽑기만 한다.

    weak 가 있으면 연습에서 자꾸 놓친 근거를 앞으로 당긴다. 발표자가 제일 까먹는
    것이 맨 앞에 와야 한다.
    """
    seen, scored = set(), []
    for w in words:
        key = w.lower()
        if key in seen or key in qwords or w in STOP:
            continue
        if _is_number(w) and not _useful_number(w):
            continue
        seen.add(key)
        score = idf.get(key, 1.0)
        if _is_number(w):
            score += 2.5          # 수치 우선 - Q&A 는 이걸 물어본다
        if weak is not None:
            score += weak.boost(page, w)   # 연습에서 놓친 것일수록 앞으로
        scored.append((score, w))
    scored.sort(key=lambda x: -x[0])
    return [w for _, w in scored[:n]]


class ReadyQ:
    def __init__(self, chunks_path: Path | str, preset: str = DEFAULT_PRESET,
                 weak_path: Path | str | None = None):
        if preset not in PRESETS:
            raise ValueError(f"모르는 프리셋: {preset} (가능: {', '.join(PRESETS)})")
        self.preset = preset
        # 연습 기록. 없으면 빈 것으로 동작한다 - 실전에서 멈추면 안 된다.
        self.weak = WeakProfile.load(weak_path)
        self.rows = [json.loads(l) for l in Path(chunks_path).open(encoding="utf-8")]
        docs = [r["text"] for r in self.rows]

        self.nouns = Nouns()
        self.idf = _idf(self.rows, self.nouns)
        # 줄별 명사를 미리 뽑아둔다. 질의 때는 집합 연산만 한다.
        self.prepared = []
        self.line_words = []
        for r in self.rows:
            lines = split_lines(r["text"])
            wl = [self.nouns(l) for l in lines]
            self.prepared.append([(l, {w.lower() for w in ws}) for l, ws in zip(lines, wl)])
            self.line_words.append({l: ws for l, ws in zip(lines, wl)})

        self.fast = BM25()
        self.fast.index(docs)

        model_id = PRESETS[preset]
        self.slow = Hybrid(BM25(), STEmbedder(model_id)) if model_id else None
        self._slow_docs = docs
        self._slow_ready = False

    def warm(self) -> float:
        """임베딩 모델을 올리고 문서를 색인한다. 발표 시작 전에 부른다.

        fast 프리셋은 2단계가 없으므로 할 일이 없다.
        balanced 는 문서 289장 기준 ~62초, accurate 는 ~721초 걸린다.
        """
        if self.slow is None:
            self._slow_ready = True
            return 0.0
        t0 = time.time()
        self.slow.index(self._slow_docs)
        self._slow_ready = True
        return time.time() - t0

    @property
    def has_stage2(self) -> bool:
        return self.slow is not None

    def _empty(self, question: str, status: str, t0: float, advice=None) -> Cue:
        """검색을 안 하고 돌려보낸다. 화면은 '근거 없음' 상태를 그리면 된다."""
        return Cue(question_type=classify(question) if status != "ignored" else "",
                   status=status, advice=advice or [],
                   latency_ms=round((time.time() - t0) * 1000, 2))

    def _cue(self, question: str, hits, stage: str, k: int, t0: float) -> Cue:
        qtype = classify(question)
        qwords = {w.lower() for w in self.nouns(question)}
        srcs, kws = [], []
        for i, _ in hits[:k]:
            r = self.rows[i]
            line = _best_line(self.prepared[i], qwords, qtype, self.idf)
            if not line:
                continue
            srcs.append(Source(slide=r["page"], snippet=line[:120], source=r["source"]))
            for w in _keywords(self.line_words[i].get(line, []), qwords,
                               self.idf, weak=self.weak, page=r["page"]):
                if w not in kws:
                    kws.append(w)
        return Cue(
            question_type=qtype,
            keywords=kws[:6],
            sources=srcs,
            deflect=DEFLECT if qtype == "한계반론" else [],
            weak_type=self.weak.weak_type(qtype),
            stage=stage,
            latency_ms=round((time.time() - t0) * 1000, 2),
        )

    def cue(self, question: str, k: int = 3) -> Cue:
        """질문 하나 -> 화면에 띄울 것. 백엔드가 부를 유일한 메서드다.

        기다렸다 한 번에 준다. 중간 결과를 먼저 띄우지 않는다.
        프리셋에 따라 BM25 만 쓰거나(fast) 하이브리드를 쓴다(balanced/accurate).
        """
        t0 = time.time()

        # 1단계 - 잡음인가. 헛기침이나 소음에 검색이 돌면 엉뚱한 근거가 뜬다.
        if is_noise(question, self.nouns):
            return self._empty(question, "ignored", t0)

        # 2단계 - 발표자료와 관련이 있는가.
        # 검색 엔진은 무조건 상위 k 개를 돌려주므로, 여기서 걸러야 '근거 없음'이 나온다.
        if known_ratio(question, self.nouns, self.idf) < MIN_KNOWN_RATIO:
            return self._empty(question, "no_evidence", t0, NO_EVIDENCE_ADVICE)

        if self.slow is not None and not self._slow_ready:
            raise RuntimeError("warm() 을 먼저 부르세요 (임베딩 모델 로딩)")
        t0 = time.time()
        engine = self.slow if self.slow is not None else self.fast
        return self._cue(question, engine.search([question], k)[0], self.preset, k, t0)

    # 아래 둘은 진단용이다. 두 방식의 결과를 비교해볼 때만 쓴다.
    def _fast_cue(self, question: str, k: int = 3) -> Cue:
        t0 = time.time()
        return self._cue(question, self.fast.search([question], k)[0], "fast", k, t0)

    def _refined_cue(self, question: str, k: int = 3) -> Cue:
        if self.slow is None:
            raise RuntimeError(f"'{self.preset}' 프리셋은 임베딩 단계가 없습니다.")
        if not self._slow_ready:
            raise RuntimeError("warm() 을 먼저 부르세요")
        t0 = time.time()
        return self._cue(question, self.slow.search([question], k)[0], "refined", k, t0)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="핫패스 시연 - 질문 하나를 처리")
    ap.add_argument("chunks", type=Path)
    ap.add_argument("question")
    ap.add_argument("--preset", choices=list(PRESETS), default=DEFAULT_PRESET)
    a = ap.parse_args()

    t0 = time.time()
    rq = ReadyQ(a.chunks, preset=a.preset)
    print(f"# 프리셋 {a.preset} / 색인 준비 {time.time() - t0:.1f}초 (발표 시작 전 1회)")

    if rq.has_stage2:
        t0 = time.time()
        rq.warm()
        print(f"# 임베딩 준비 {time.time() - t0:.1f}초 (발표 시작 전 1회)")

    print()
    print(json.dumps(rq.cue(a.question).to_message(), ensure_ascii=False, indent=2))
