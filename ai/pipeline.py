"""Ready-Q 핫패스 — 질문 텍스트 하나가 들어오면 화면에 띄울 것을 돌려준다.

백엔드가 붙일 대상이 이 파일이다. STT 구현은 모른다. 텍스트만 받는다.

2단계로 돌려주는 이유:
  1단계 BM25 (~5ms)      질문이 끝나자마자 뭔가 보여야 한다. 빈 화면이 제일 나쁘다.
  2단계 하이브리드(~220ms) 더 정확한 것으로 조용히 갱신한다.

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
                # 숫자 뒤 단위를 붙여 되살린다: 3 + 회 -> 3회
                if i + 1 < len(toks) and toks[i + 1].tag in UNIT_TAGS and len(toks[i + 1].form) <= 2:
                    out.append(t.form + toks[i + 1].form)
                    i += 2
                    continue
                out.append(t.form)
            elif t.tag in NOUN_TAGS and len(t.form) >= 2:
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


def _keywords(words: list[str], qwords: set, idf: dict, n: int = 5) -> list[str]:
    """고른 줄에서 화면에 띄울 말을 뽑는다. 만들지 않고 뽑기만 한다."""
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
        scored.append((score, w))
    scored.sort(key=lambda x: -x[0])
    return [w for _, w in scored[:n]]


class ReadyQ:
    def __init__(self, chunks_path: Path | str, preset: str = DEFAULT_PRESET):
        if preset not in PRESETS:
            raise ValueError(f"모르는 프리셋: {preset} (가능: {', '.join(PRESETS)})")
        self.preset = preset
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
            for w in _keywords(self.line_words[i].get(line, []), qwords, self.idf):
                if w not in kws:
                    kws.append(w)
        return Cue(
            question_type=qtype,
            keywords=kws[:6],
            sources=srcs,
            deflect=DEFLECT if qtype == "한계반론" else [],
            stage=stage,
            latency_ms=round((time.time() - t0) * 1000, 2),
        )

    def fast_cue(self, question: str, k: int = 3) -> Cue:
        """1단계 — 질문이 끝나자마자 띄운다."""
        t0 = time.time()
        return self._cue(question, self.fast.search([question], k)[0], "fast", k, t0)

    def refined_cue(self, question: str, k: int = 3) -> Cue:
        """2단계 — 더 정확한 것으로 갱신한다. warm() 이 선행돼야 한다."""
        if self.slow is None:
            raise RuntimeError(
                f"'{self.preset}' 프리셋은 2단계가 없습니다. fast_cue() 만 쓰세요.")
        if not self._slow_ready:
            raise RuntimeError("warm() 을 먼저 부르세요 (임베딩 모델 로딩)")
        t0 = time.time()
        return self._cue(question, self.slow.search([question], k)[0], "refined", k, t0)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="핫패스 시연 - 질문 하나를 2단계로 처리")
    ap.add_argument("chunks", type=Path)
    ap.add_argument("question")
    ap.add_argument("--preset", choices=list(PRESETS), default=DEFAULT_PRESET)
    ap.add_argument("--refine", action="store_true", help="2단계까지 (임베딩 로딩 필요)")
    a = ap.parse_args()

    t0 = time.time()
    rq = ReadyQ(a.chunks, preset=a.preset)
    print(f"# 프리셋 {a.preset} / 색인 준비 {time.time() - t0:.1f}초 (발표 시작 전 1회)")

    print("\n# 1단계 - 발화 종료 즉시")
    print(json.dumps(rq.fast_cue(a.question).to_message(), ensure_ascii=False, indent=2))

    if a.refine and rq.has_stage2:
        t0 = time.time()
        rq.warm()
        print(f"\n# 임베딩 로딩 {time.time() - t0:.1f}초 (발표 시작 전 1회)")
        print("\n# 2단계 - 갱신")
        print(json.dumps(rq.refined_cue(a.question).to_message(), ensure_ascii=False, indent=2))
