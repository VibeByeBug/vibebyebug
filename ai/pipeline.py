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
from typing import Iterator

from embedders import BM25, Hybrid, STEmbedder, _tokens
from qtype import classify
from weak_profile import WeakProfile
import qa_log
import core_answers
import deck_graph
import notes as notes_mod
import knowledge
import knowledge_graph

# 유형별로 슬라이드에서 '무엇을 보여줄지'가 다르다.
# 검색에 유형을 쓰는 건 실패했지만(README 참고), 무엇을 띄울지 고르는 데는 맞다.
LINE_PREF = {
    # 숫자만 있으면 안 된다. 특허번호나 날짜 조각이 아니라 단위나 자릿수가 붙은 수치여야 한다.
    "사실확인": re.compile(r"\d[\d,.]*\s*(?:%|[가-힣]{1,2}|배)|\$\s?\d|\d,\d{3}|\d\.\d"),
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


# 묻는 말. 명사가 하나도 없어도 이런 말이 있으면 질문이다.
# "어떻게만들었나" 는 명사가 없어서(어떻게=부사, 만들었나=동사) 잡음으로 버려졌다.
QUESTION_CUE = re.compile(r"어떻게|어째서|왜|무엇|뭐|뭘|어떤|언제|누가|얼마|몇|\?|나요|까요|습니까|했나|했어|인가|인지|을까|를까")


def is_noise(text: str, nouns_fn) -> bool:
    """질문이 아니라 잡음인가."""
    t = (text or "").strip()
    if len(t) < MIN_CHARS:
        return True
    words = nouns_fn(t)
    if len(words) < MIN_NOUNS:
        return not QUESTION_CUE.search(t)
    # 명사가 있어도 전부 추임새면 잡음이다
    return all(w in FILLER for w in words)


# 어느 발표에나 나오는 질문 말. 자료에 이 단어가 없다고 근거 없음으로 막으면 안 된다.
# 실제로 "이 프로젝트를 왜 만드셨죠", "이 프로젝트의 한계" 가 전부 근거 없음으로 막혔다
# (19장 자료에 프로젝트, 이유, 한계, 장점이 한 번도 안 나왔다).
# 자료 쪽에서 같은 내용을 가리키는 표현으로 바꿔 찾는다. 빈 튜플은 바꿀 말이 없는 순수 지시어다.
_WHY = ("문제", "배경", "목적", "필요", "현황", "우려", "해결")
_LIMIT = ("한계", "다만", "향후", "과제", "리스크", "제외", "가상", "근사")
_MERIT = ("차별", "기존", "대비", "비교", "강점", "효과", "절감")
_PLAN = ("목표", "계획", "로드맵", "단계", "출시", "확장")
_WHAT = ("개요", "소개", "플랫폼", "해결", "목표", "핵심")
# "어떻게 만들었나요", "어떻게 동작해요" 처럼 방법을 묻는 말
_HOW = ("방법", "구현", "구조", "단계", "과정", "기술", "설계", "구성")
META_EXPAND = {
    "프로젝트": (), "서비스": (), "발표": (), "연구": (), "시스템": (), "아이디어": (), "작품": (),
    "주제": (), "내용": (),
    "이유": _WHY, "계기": _WHY, "배경": _WHY, "동기": _WHY, "목적": _WHY, "필요성": _WHY,
    "한계": _LIMIT, "단점": _LIMIT, "약점": _LIMIT, "리스크": _LIMIT, "문제점": _LIMIT, "보완": _LIMIT,
    "장점": _MERIT, "강점": _MERIT, "차별점": _MERIT, "차별성": _MERIT, "차이": _MERIT, "경쟁력": _MERIT,
    "계획": _PLAN, "향후": _PLAN, "앞으로": _PLAN, "목표": _PLAN, "방향": _PLAN,
    "효과": ("효과", "기대", "절감", "개선"), "기대효과": ("효과", "기대", "절감", "개선"),
    "의의": _MERIT + _WHY, "가치": _MERIT + _WHY, "중요성": _WHY, "의미": _MERIT + _WHY,
}


# 질문할 때 붙는 말. 내용어로 세면 "의의가 뭐라고 생각하세요?" 가 기본 질문으로 안 잡히고
# "생각" 이 자료에 없어서 근거 없음으로 막혔다.
QUESTION_TALK = {"생각", "말씀", "설명", "질문", "의견", "얘기", "이야기", "혹시", "개인",
                 "부분", "정도", "어느", "무엇", "뭐", "거", "것", "점"}


def _content_words(question: str, nouns_fn) -> list[str]:
    return [w for w in nouns_fn(question)
            if w not in FILLER and w not in META_EXPAND and w not in QUESTION_TALK and len(w) >= 2]


def known_ratio(question: str, nouns_fn, idf: dict) -> float:
    """질문에 쓰인 낱말 중 발표자료에 실제로 있는 비율. 어느 발표에나 나오는 말은 뺀다."""
    words = _content_words(question, nouns_fn)
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

WARM_QUESTIONS = (
    "데이터는 어디서 받으셨어요?",
    "그 결과가 맞다는 근거는 무엇이고 한계는 없나요?",
    "전체 과정을 어떤 순서로 진행했는지, 각 단계에서 어떤 기준을 썼는지 자세히 설명해주실 수 있을까요?",
    "비용은 얼마인가요",
    "이 방법이 기존 방식보다 나은 이유와 실제로 검증한 결과가 궁금합니다",
)

# 화면에 무엇까지 띄울지. 발표는 키워드로 충분할 수 있지만 회의나 업무 자리는 답변 문장이 필요하다.
MODES = ("keywords", "answer", "flow")


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
    mode: str = "keywords"    # answer 면 화면은 뒤이어 올 cue.answer 자리를 비워둔다
    # 연습에서 발표자가 확정한 기본 질문 답. 있으면 화면은 이 카드를 먼저 띄운다.
    core: dict | None = None
    # 기본 질문인데 아직 확정한 답이 없을 때 그 질문 이름 (화면 안내용)
    core_pending: str = ""

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


# 검색 순위 가산점. 톰과젤리 45문항과 PotentiAI 18문항으로 정했다.
#   (1.5, 0.75) PotentiAI 10/18, 톰과젤리 29/45  /  (3, 1.5) 9/18, 30/45  /  순위만 따름 9/18, 27/45
# 둘 다 크게 흔들지 않는 (3, 1.5). 문항 수가 적어서 더 잘게 맞추지 않았다.
RANK_BONUS = (3.0, 1.5, 0.0, 0.0, 0.0)

# 논리 지도로 더 붙일 슬라이드 수. 많을수록 흐름도와 추천 답변이 느려진다.
GRAPH_EXTRA = 3
# 통합 지식 조각 검색 (knowledge.py). 답변과 흐름도에 넘길 조각 수.
# 조각 하나가 슬라이드 묶음이나 이어진 문장 3개 정도라, 8개면 슬라이드 서너 장 분량이다.
KB_K = 8
# 지식 그래프로 더할 이웃 조각 수. 검색 상위 몇 개의 이웃에서 고를지.
KG_EXTRA = 3
KG_SEED = 4
# 슬라이드에서 근거를 못 찾았을 때 대신 넘길 발표자 설명 수와 슬라이드 수 (_fallback)
FALLBACK_NOTES = 10
FALLBACK_SLIDES = 4

HEADING = re.compile(r"^[\[\(<※★①-⑤]|^STEP\s|^\s*[-•]\s*$")


# 표나 카드 모양 슬라이드는 값이 제목 아래 줄에 따로 있다.
#   "월 고정비" / "30만원",  "B2B 채용 검증" / "15,000원"
# 질문 단어는 제목 줄에만 걸리고 값 줄에는 안 걸려서, 제목만 뜨거나 엉뚱한 줄이 떴다.
# 짧은 제목 줄 바로 아래 짧은 숫자 줄이 오면 둘을 합친 후보를 하나 더 만든다.
# 영문에 붙은 숫자(B2B, 2-Track 의 앞 글자 제외)는 값이 아니다
_VALUE = re.compile(r"(?<![A-Za-z])\d(?![A-Za-z])")
LABEL_MAX = 25
VALUE_MAX = 20


def split_lines(text: str) -> list[str]:
    raw = [l.strip() for l in text.split(chr(10)) if l.strip()]
    out = []
    for i, l in enumerate(raw):
        if len(l) > 6:
            out.append(l)
        if (i + 1 < len(raw) and len(l) <= LABEL_MAX and not _VALUE.search(l)
                and len(raw[i + 1]) <= VALUE_MAX and _VALUE.search(raw[i + 1])):
            out.append(f"{l} {raw[i + 1]}")
    return out


PARTIAL = 0.7        # "구독자" 와 "구독", "일치" 와 "일치율" 처럼 한쪽이 다른 쪽을 품을 때
PER_MATCH = 0.4      # 같은 점수면 질문 단어를 더 많이 담은 줄
RAW_WEIGHT = 1.2


def _match(words: set, qwords: set, idf: dict) -> tuple[float, int]:
    """줄이 질문 단어를 얼마나 담았나. (점수, 맞은 질문 단어 수)

    형태소 분석 결과가 질문과 자료에서 다르게 끊기는 일이 잦다.
    질문 "손익분기점" 은 손익/분기점, 자료는 "손익분기점" 한 덩어리로 나온다.
    정확히 같아야만 세면 이런 줄이 0점이 된다.
    """
    score, n = 0.0, 0
    for q in qwords:
        if q in words:
            score += idf.get(q, 0.0)
            n += 1
            continue
        if len(q) < 2:
            continue
        part = [w for w in words if len(w) >= 2 and not _is_number(w) and (q in w or w in q)]
        if part:
            score += PARTIAL * max(idf.get(w, 0.0) for w in part)
            n += 1
    return score, n


def _raw_keys(question: str, qwords: set, idf: dict) -> set:
    """자료에 없는 질문 단어는 분석기가 잘못 자른 것일 수 있다. 원래 어절 글자로 찾는다.

    "이예진 팀원은" 이 이예지 + ㄴ 으로 잘려서, 자료의 "이예진" 과 영영 안 맞았다.
    """
    keys = set()
    for w in qwords:
        if w in idf or len(w) < 2 or not re.match(r"[가-힣]", w):
            continue
        for eojeol in question.split():
            if eojeol.startswith(w[:2]):
                m = re.match(r"[가-힣]{3,}", eojeol)
                if m:
                    keys.add(m.group(0)[:len(w)])
    return keys


def _best_line(prepared: list[tuple[str, set]], qwords: set, qtype: str, idf: dict) -> str:
    return _score_lines(prepared, qwords, qtype, idf)[0]


def _score_lines(prepared: list[tuple[str, set]], qwords: set, qtype: str,
                 idf: dict, raw: set = frozenset()) -> tuple[str, float]:
    """슬라이드에서 화면에 띄울 한 줄을 고른다. (줄, 점수)

    prepared 는 (줄, 그 줄의 명사집합) 목록이다. 명사 분석은 색인 때 끝내둔다 -
    질의마다 다시 하면 슬라이드당 수십 ms 가 붙는다.
    """
    if not prepared:
        return "", float("-inf")
    pref = LINE_PREF.get(qtype)
    best, best_score = prepared[0][0], float("-inf")
    for i, (line, words) in enumerate(prepared):
        score, n = _match(words, qwords, idf)
        for key in raw:
            if key in line:
                # 자료 사전에 없던 말이 줄에 그대로 있으면 가장 드문 단어로 친다 (이름, 고유명사)
                score += RAW_WEIGHT * max(idf.values(), default=1.0)
                n += 1
        score += PER_MATCH * n
        # 유형 가산점은 질문과 닿은 줄에만 준다. 안 그러면 숫자만 있는 엉뚱한 줄이
        # ("특허가출원 참여(10-2026-0110645)") 질문 단어를 더 담은 줄을 이겼다.
        if pref and n and pref.search(line):
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
    return best, best_score


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
                 weak_path: Path | str | None = None,
                 log_path: Path | str | None = qa_log.DEFAULT_PATH,
                 session: str = "", mode: str = "keywords"):
        if preset not in PRESETS:
            raise ValueError(f"모르는 프리셋: {preset} (가능: {', '.join(PRESETS)})")
        self.preset = preset
        self.set_mode(mode)
        self._answerer = None
        self.core_cards: dict[str, dict] = {}   # set_core() 로 넣는다
        # 연습 기록. 없으면 빈 것으로 동작한다 - 실전에서 멈추면 안 된다.
        self.weak = WeakProfile.load(weak_path)
        # 실전 기록. 사후 리포트의 재료다. None 이면 기록하지 않는다.
        self.log_path = log_path
        self.session = session
        self.expected = []          # set_expected() 로 넣으면 적중률도 기록
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

        # 통합 지식 조각 (슬라이드 + 대본 + 설명 자료 + 리허설). 답변과 흐름도의 근거를 여기서 찾는다.
        # 화면의 키워드와 근거 카드는 지금처럼 슬라이드 검색(cue)을 쓴다.
        self.use_kb = True
        self.notes: list[dict] = []
        self.refined: dict[int, str] = {}
        self.kb: list[dict] = []
        self.kb_index = None
        self.kgraph: dict | None = None      # set_kgraph() 로 넣는다 (knowledge_graph.py)
        # 지식 그래프 이웃을 답변 근거에 더할지. 지금은 끈다 (2026-09-19 측정):
        #   여러 조각을 엮어야 하는 질문 8개 x 2회에서 근거에 든 사실 88% -> 88%, 답변 69% -> 71%.
        #   조각 60개 중 8개를 검색하면 이미 필요한 사실의 88% 가 들어왔다. 병목은 검색이 아니라
        #   답변 길이(2문장)였다. 그래프는 화면의 지식 지도에 쓰고, 자료가 커지면 다시 잰다.
        self.use_kg = False
        self._build_kb()

    def warm(self) -> float:
        """임베딩 모델을 올리고 문서를 색인한다. 발표 시작 전에 부른다.

        fast 프리셋은 2단계가 없으므로 할 일이 없다.
        balanced 는 문서 289장 기준 ~62초, accurate 는 ~721초 걸린다.
        """
        t0 = time.time()
        if self.mode in ("answer", "flow"):
            self._get_answerer().warm()
        if self.slow is None:
            self._slow_ready = True
            return time.time() - t0
        self.slow.index(self._slow_docs)
        self._slow_ready = True
        self._build_kb()
        # 준비 직후 첫 질문 몇 개가 200~280ms 로 느렸다(이후 50~70ms).
        # 질문 길이가 달라질 때마다 모델 내부 연산이 처음 한 번 준비되는 비용이라
        # 길이가 다른 가짜 질문을 미리 흘려서 발표 전에 치르게 한다. 기록은 남기지 않는다.
        for q in WARM_QUESTIONS:
            self.slow.search([q], 3)
            self._cue(q, self.fast.search([q], 3)[0], "warm", 3, time.time())
        return time.time() - t0

    @property
    def has_stage2(self) -> bool:
        return self.slow is not None

    def _empty(self, question: str, status: str, t0: float, advice=None) -> Cue:
        """검색을 안 하고 돌려보낸다. 화면은 '근거 없음' 상태를 그리면 된다."""
        return Cue(question_type=classify(question) if status != "ignored" else "",
                   status=status, advice=advice or [], mode=self.mode,
                   latency_ms=round((time.time() - t0) * 1000, 2))

    def _cue(self, question: str, hits, stage: str, k: int, t0: float, extra=frozenset()) -> Cue:
        qtype = classify(question)
        qwords = {w.lower() for w in self.nouns(question)} | {t.lower() for t in extra}
        srcs, kws = [], []
        picked = []
        raw = _raw_keys(question, qwords, self.idf)
        for rank, (i, _) in enumerate(hits[:k]):
            line, score = _score_lines(self.prepared[i], qwords, qtype, self.idf, raw)
            if line:
                picked.append((score + RANK_BONUS[rank], rank, i, line))
        # 검색 1위 슬라이드의 줄이 질문과 잘 안 맞고 2, 3위 슬라이드에 딱 맞는 줄이 있으면
        # 그걸 먼저 보여준다. 검색 순위는 가산점으로만 반영한다.
        picked.sort(key=lambda x: (-x[0], x[1]))
        for _, _, i, line in picked:
            r = self.rows[i]
            # 글머리표는 화면에서 군더더기다 ("-바이브 코딩 경진 대회...")
            shown = re.sub(r"^[-•▪◦●○■□※➢❖✓]\s*", "", line)
            srcs.append(Source(slide=r["page"], snippet=shown[:120], source=r["source"]))
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
            mode=self.mode,
        )

    def cue(self, question: str, k: int = 3) -> Cue:
        """질문 하나 -> 화면에 띄울 것. 백엔드가 부를 유일한 메서드다.

        기다렸다 한 번에 준다. 중간 결과를 먼저 띄우지 않는다.
        프리셋에 따라 BM25 만 쓰거나(fast) 하이브리드를 쓴다(balanced/accurate).
        """
        t0 = time.time()

        # 1단계 - 잡음인가. 헛기침이나 소음에 검색이 돌면 엉뚱한 근거가 뜬다.
        if is_noise(question, self.nouns):
            c = self._empty(question, "ignored", t0)
            self._log(c, question)
            return c

        # 연습에서 확정한 기본 질문 답이 있으면 그걸 띄운다. 여기서는 추론하지 않는다.
        core_id = self._core_id(question)
        if core_id and core_id in self.core_cards:
            c = self._core_cue(question, self.core_cards[core_id], t0)
            self._log(c, question)
            return c
        pending = core_answers.LABEL.get(core_id, "") if core_id else ""

        # 2단계 - 발표자료와 관련이 있는가.
        # 검색 엔진은 무조건 상위 k 개를 돌려주므로, 여기서 걸러야 '근거 없음'이 나온다.
        query, extra = question, set()
        if _content_words(question, self.nouns):
            if known_ratio(question, self.nouns, self.idf) < MIN_KNOWN_RATIO:
                c = self._empty(question, "no_evidence", t0, NO_EVIDENCE_ADVICE)
                c.core_pending = pending
                self._log(c, question)
                return c
        else:
            # "이 프로젝트의 한계는?" 처럼 어느 발표에나 나오는 말로만 된 질문.
            # 자료 쪽 표현으로 바꿔 찾는다. 바꾼 말도 자료에 없으면 근거 없음이다.
            terms = [t for w in self.nouns(question) for t in META_EXPAND.get(w, ())]
            # "왜", "뭔가요" 는 명사가 아니라 위에서 안 잡힌다
            if re.search(r"왜|어째서", question):
                terms += _WHY
            if re.search(r"뭔가|뭐예|뭐에요|무엇|뭐하는|어떤 거", question):
                terms += _WHAT
            if re.search(r"어떻게|어떤 방법|어떤 식", question):
                terms += _HOW
            extra = {t for t in terms if t.lower() in self.idf}
            if not extra:
                c = self._empty(question, "no_evidence", t0, NO_EVIDENCE_ADVICE)
                c.core_pending = pending
                self._log(c, question)
                return c
            query = f"{question} {' '.join(sorted(extra))}"

        if self.slow is not None and not self._slow_ready:
            raise RuntimeError("warm() 을 먼저 부르세요 (임베딩 모델 로딩)")
        engine = self.slow if self.slow is not None else self.fast
        cue = self._cue(question, engine.search([query], k)[0], self.preset, k, t0, extra)
        cue.core_pending = pending
        self._log(cue, question)
        return cue

    def _log(self, cue: Cue, question: str) -> None:
        if self.log_path:
            qa_log.append(cue, question, self.log_path, self.session,
                          self.expected or None)

    def set_mode(self, mode: str) -> None:
        """keywords: 키워드와 근거만 (모델 호출 0회)
        answer:   키워드와 근거 뒤에 추천 답변까지 (질문당 호출 1회)
        """
        if mode not in MODES:
            raise ValueError(f"모르는 모드: {mode} (가능: {', '.join(MODES)})")
        self.mode = mode

    def answer(self, question: str, cue: Cue) -> Iterator[dict]:
        """cue() 결과에 이어 추천 답변을 문장 단위로 내보낸다. answer 모드에서만 부른다.

        cue() 를 먼저 화면에 보낸 뒤에 부른다. 모델 호출이 1~2초 걸려서
        키워드까지 같이 기다리게 하면 안 된다.

        메시지는 {"type": "cue.answer", "text", "done", "latency_ms"} 이고,
        마지막 메시지(done=True)에 status 가 붙는다: ok | no_answer | blocked | error | skipped
        """
        if self.use_kb and not cue.core and cue.status != "ignored":
            slides, story, has_slide = self._kb_context(question)
            if slides:
                answerer = self._get_answerer()
                tag = {} if has_slide else {"basis": "notes"}
                yield from self._or_infer(
                    ({**m, **tag} for m in self._or_fallback(
                        answerer.stream(question, slides, story),
                        lambda ctx: answerer.stream(question, *ctx), question, dict(slides))),
                    lambda: answerer.stream(question, slides, story, infer=True), self._related(question, cue))
                return
        if self._use_fallback(cue):
            ctx = self._fallback(question)
            if ctx:
                for m in self._get_answerer().stream(question, *ctx):
                    yield {**m, "basis": "notes"}
                return
        if cue.status != "ok" or not cue.sources or cue.core:
            # 근거 없는 질문에 답변을 만들면 지어낸 말이 된다
            yield {"type": "cue.answer", "text": "", "done": True,
                   "latency_ms": 0.0, "status": "skipped"}
            return
        answerer = self._get_answerer()
        by_page = {}
        for s in cue.sources:
            row = next((r for r in self.rows if r["page"] == s.slide and r["source"] == s.source), None)
            if row is not None:
                by_page.setdefault(s.slide, self._page_text(row))
        slides, story = self._with_graph(by_page, question)
        yield from self._or_fallback(
            answerer.stream(question, slides, story),
            lambda ctx: answerer.stream(question, *ctx), question, dict(slides))

    def flow(self, question: str, cue: Cue) -> Iterator[dict]:
        """cue() 결과에 이어 말할 순서를 흐름도 칸으로 내보낸다. flow 모드에서만 부른다.

        메시지는 {"type": "cue.flow", "steps": [{"text", "slide"}], "done", "latency_ms"} 이고,
        마지막 메시지에 status 가 붙는다: ok | no_answer | blocked | error | skipped
        """
        if self.use_kb and not cue.core and cue.status != "ignored":
            slides, story, has_slide = self._kb_context(question)
            if slides:
                answerer = self._get_answerer()
                tag = {} if has_slide else {"basis": "notes"}
                yield from self._or_infer(
                    ({**m, **tag} for m in self._or_fallback(
                        answerer.flow(question, cue.question_type, slides, story),
                        lambda ctx: answerer.flow(question, cue.question_type, *ctx), question, dict(slides))),
                    lambda: answerer.flow(question, cue.question_type, slides, story, infer=True),
                    self._related(question, cue))
                return
        if self._use_fallback(cue):
            ctx = self._fallback(question)
            if ctx:
                for m in self._get_answerer().flow(question, cue.question_type, *ctx):
                    yield {**m, "basis": "notes"}
                return
        if cue.status != "ok" or not cue.sources or cue.core:
            yield {"type": "cue.flow", "steps": [], "done": True,
                   "latency_ms": 0.0, "status": "skipped"}
            return
        by_page = {}
        for s in cue.sources:
            row = next((r for r in self.rows if r["page"] == s.slide and r["source"] == s.source), None)
            if row is not None:
                by_page.setdefault(s.slide, self._page_text(row))
        slides, story = self._with_graph(by_page, question)
        answerer = self._get_answerer()
        yield from self._or_fallback(
            answerer.flow(question, cue.question_type, slides, story),
            lambda ctx: answerer.flow(question, cue.question_type, *ctx), question, dict(slides))

    def _related(self, question: str, cue: Cue) -> bool:
        """발표와 조금이라도 관련된 질문인가. 추론 답은 이런 질문에만 만든다.

        "점심 뭐 먹지?" 같은 잡담에 추론 답을 띄우면 발표자가 헷갈린다. 자료에 있는 낱말이 하나라도 있거나,
        프로젝트, 한계, 팀처럼 어느 발표에나 나오는 질문 말이 있으면 관련 있다고 본다.
        """
        if cue.status == "ok":
            return True
        words = [w.lower() for w in self.nouns(question)]
        if any(w in self.idf for w in words if len(w) >= 2 and w not in FILLER):
            return True
        return any(w in META_EXPAND for w in words) or bool(
            re.search(r"여러분|팀|발표|이거|이것|이 서비스|이 프로젝트|왜|어떻게", question))

    @staticmethod
    def _or_infer(first: Iterator[dict], infer, related: bool = True) -> Iterator[dict]:
        """자료로 답하지 못하면(no_answer) 추론 모드로 한 번 더 만든다. 화면에 "추론한 답" 으로 표시된다."""
        for m in first:
            # 자료로 답할 수 없다고 했거나, 첫 문장(첫 칸)부터 자료에 없는 숫자가 나와 아무것도 못 띄운 경우
            empty = m.get("status") == "no_answer" or (
                m.get("status") == "blocked" and not m.get("text") and not m.get("steps"))
            if related and m.get("done") and empty:
                for m2 in infer():
                    yield {**m2, "basis": "inferred"}
                return
            yield m

    def _or_fallback(self, first: Iterator[dict], again, question: str, base: dict) -> Iterator[dict]:
        """슬라이드로 만든 답이 "자료로 답할 수 없음" 이면 보강 자료와 논리 지도를 더해 한 번 더 만든다.

        검색은 슬라이드를 찾았는데 그 슬라이드에 답이 없는 경우다("형태소 분석기는 왜 필요했나요?" 에
        검색은 비슷한 낱말이 있는 슬라이드를 주지만 이유는 설명 자료에만 있다).
        """
        for m in first:
            if m.get("done") and m.get("status") == "no_answer":
                ctx = self._fallback(question, base)
                if ctx:
                    for m2 in again(ctx):
                        yield {**m2, "basis": "notes"}
                    return
            yield m

    def set_refined(self, refined: dict[int, str] | None) -> None:
        """AI 정리본 (slide_refine). 슬라이드 조각을 정리본의 묶음 단위로 나누는 데 쓴다."""
        self.refined = dict(refined or {})
        self._build_kb()

    def _build_kb(self) -> None:
        """지식 조각을 다시 만들고 색인한다. 설명이나 정리본이 바뀔 때마다 부른다(19장 기준 1초 안팎)."""
        self.kb = knowledge.build(self.rows, getattr(self, "notes", []), getattr(self, "refined", {}))
        self._kb_by_id = {c["id"]: c for c in self.kb}
        self._kb_words = {c["id"]: {w.lower() for w in self.nouns(c["text"])} for c in self.kb}
        docs = [c["text"] for c in self.kb]
        if self.slow is not None and self._slow_ready:
            # 임베딩 모델은 슬라이드 검색과 같이 쓴다 (다시 올리면 메모리와 시간이 두 배)
            emb = STEmbedder(self.slow.b.model_id)
            emb._model = self.slow.b._load()
            self.kb_index = Hybrid(BM25(), emb)
        else:
            self.kb_index = BM25()
        self.kb_index.index(docs)

    def _kb_context(self, question: str) -> tuple[list[tuple[int, str]], str, bool]:
        """질문에 맞는 지식 조각 -> (답변 자료, 발표 줄거리, 슬라이드 조각이 하나라도 있었나)."""
        hits = self.kb_index.search([question], KB_K)[0] if self.kb else []
        picked = [self.kb[i] for i, _ in hits]
        if self.use_kg and self.kgraph:
            picked = self._with_kgraph(picked, question)
        slides = knowledge.to_context(picked)
        graph = getattr(self, "graph", None)
        story = deck_graph.story_text(graph) if graph else ""
        return slides, story, any(c["kind"] == "slide" for c in picked)

    def set_kgraph(self, graph: dict | None) -> None:
        """지식 그래프 (knowledge_graph.py). 없으면 검색한 조각만 쓴다."""
        self.kgraph = graph if graph and graph.get("ok") else None

    def _with_kgraph(self, picked: list[dict], question: str) -> list[dict]:
        """검색한 조각에 지식 그래프의 이웃을 더하고, 같은 내용이 겹치면 하나만 남긴다.

        이웃을 다 붙이면 연결이 많은 조각(서비스 소개 등)이 질문과 상관없이 매번 끼었다
        (슬라이드 논리 지도에서 겪은 것과 같다). 질문 낱말과 맞는 이웃만 더한다.
        """
        qwords = {w.lower() for w in self.nouns(question)}
        ids = [c["id"] for c in picked]
        scored = []
        for cid, _ in knowledge_graph.neighbors(self.kgraph, ids[:KG_SEED]):
            c = self._kb_by_id.get(cid)
            if c is None:
                continue
            score, n = _match(self._kb_words.get(cid, set()), qwords, self.idf)
            if n:
                scored.append((score, c))
        scored.sort(key=lambda x: -x[0])
        out = picked + [c for _, c in scored[:KG_EXTRA]]
        # 같은 내용: 슬라이드 조각을 남긴다 (화면에 슬라이드 번호를 보여줄 수 있다)
        same = knowledge_graph.same_pairs(self.kgraph)
        keep = []
        for c in out:
            twin = next((k for k in keep if (k["id"], c["id"]) in same), None)
            if twin is None:
                keep.append(c)
            elif c["kind"] == "slide" and twin["kind"] != "slide":
                keep[keep.index(twin)] = c
        return keep

    def set_notes(self, notes: list[dict] | None) -> None:
        """발표자 설명(리허설, 대본, 설명 자료)을 넣는다. 검색 색인을 다시 만든다.

        검색에는 슬라이드 반복 문장까지 다 붙인다. 청중은 슬라이드 문구가 아니라 말하듯이 묻는데,
        발표자가 말로 풀어낸 표현이 그 질문과 더 닮았다.
        답변 근거로는 슬라이드에 없는 설명(explain)과 확인된 사실(fact)만 쓴다(_page_text).
        화면에 뜨는 근거 문장은 여전히 슬라이드 원문이다(self.prepared 는 그대로).
        """
        self.notes = list(notes or [])
        docs = []
        for r in self.rows:
            extra = [n["text"] for n in notes_mod.for_page(self.notes, r["page"], answer_only=False)]
            docs.append("\n".join([r["text"], *extra]))
        # 근거 없음 판정도 설명에 나온 말을 알아야 한다. 안 그러면 설명으로 답할 수 있는 질문을 막는다.
        self.idf = _idf([{"text": d} for d in docs] + [{"text": n["text"]} for n in notes_mod.general(self.notes)],
                        self.nouns)
        self.fast = BM25()
        self.fast.index(docs)
        self._slow_docs = docs
        if self.slow is not None and self._slow_ready:
            self.slow.index(docs)
        self._build_kb()

    def _page_text(self, row: dict) -> str:
        """답변 근거로 넘길 슬라이드 내용. 발표자 설명이 있으면 아래에 붙인다."""
        extra = notes_mod.for_page(getattr(self, "notes", []), row["page"])
        if not extra:
            return row["text"]
        return "\n".join([row["text"], *(f"[발표자 설명] {n['text']}" for n in extra)])

    def _general_notes(self, question: str, limit: int = 3) -> str:
        """특정 슬라이드가 아닌 프로젝트 설명 중 질문과 맞는 것."""
        general = notes_mod.general(getattr(self, "notes", []))
        if not general:
            return ""
        qwords = {w.lower() for w in self.nouns(question)}
        scored = []
        for n in general:
            score, k = _match({w.lower() for w in self.nouns(n["text"])}, qwords, self.idf)
            if k:
                scored.append((score, n["text"]))
        scored.sort(key=lambda x: -x[0])
        return "\n".join(f"[프로젝트 설명] {t}" for _, t in scored[:limit])

    def set_graph(self, graph: dict | None) -> None:
        """발표자료 논리 지도 (deck_graph). 없으면 지금처럼 검색한 슬라이드만 쓴다."""
        self.graph = graph

    def _with_graph(self, by_page: dict, question: str = "") -> tuple[list[tuple[int, str]], str]:
        """검색한 슬라이드에 논리적으로 연결된 슬라이드를 붙인다. 그리고 발표 줄거리.

        "왜 이 방법이 맞나요?" 처럼 문제, 방법, 검증이 여러 장에 흩어진 질문에서
        검색이 한두 장만 찾아도 나머지를 논리 지도로 끌어온다.

        처음엔 이웃을 전부 붙였더니 연결이 많은 슬라이드(문제 제기 3번 등)가 질문과 상관없이
        매번 끼었다. 그래서 두 길로 후보를 모으고 질문 단어와 맞는 것만 남긴다.
          이웃    검색한 슬라이드와 논리 지도로 이어진 슬라이드
          줄거리  질문과 맞는 줄거리 단계의 슬라이드 (검색이 처음부터 놓친 슬라이드를 찾는 길)
        """
        graph = getattr(self, "graph", None)
        if not graph:
            return self._add_general(by_page, question), ""
        pages = list(by_page)
        qwords = {w.lower() for w in self.nouns(question)} if question else set()

        cands = deck_graph.neighbors(graph, pages, limit=10)
        for line in graph.get("story", []):
            lw = {w.lower() for w in self.nouns(line["text"])}
            if qwords & lw:
                cands += [p for p in line.get("pages", []) if p not in cands]

        scored = []
        for p in cands:
            if p in by_page:
                continue
            i = next((k for k, r in enumerate(self.rows) if r["page"] == p), None)
            if i is None:
                continue
            words = set().union(*(w for _, w in self.prepared[i])) if self.prepared[i] else set()
            score, n = _match(words, qwords, self.idf)
            if n:
                scored.append((score, p, i))
        scored.sort(key=lambda x: -x[0])
        for _, p, i in scored[:GRAPH_EXTRA]:
            by_page.setdefault(p, self._page_text(self.rows[i]))
        return self._add_general(by_page, question), deck_graph.story_text(graph)

    @staticmethod
    def _use_fallback(cue: Cue) -> bool:
        """슬라이드에서 근거를 못 찾은 질문인가. 잡음(ignored)과 연습 확정 답(core)은 빼고."""
        if cue.core or cue.status == "ignored":
            return False
        return cue.status == "no_evidence" or not cue.sources

    def _fallback(self, question: str, base: dict | None = None) -> tuple[list[tuple[int, str]], str] | None:
        """슬라이드에서 근거를 못 찾았을 때 쓸 자료. 발표자 설명과 논리 지도 줄거리로 모은다.

        "이 프로젝트의 의의는?" 처럼 슬라이드 글자와 겹치지 않는 질문도 발표자가 대본이나
        설명 자료로 넣어둔 내용, 논리 지도가 정리한 발표 줄거리로는 답할 수 있는 경우가 많다.
        여기서도 모델은 넘긴 자료 안에서만 답하고, 숫자는 자료와 대조한다(answer.py).
        보강 자료도 논리 지도도 없으면 None - 지금처럼 근거 없음으로 둔다.
        """
        notes = [n for n in getattr(self, "notes", []) if n.get("kind") in ("explain", "fact")]
        graph = getattr(self, "graph", None)
        if not notes and not graph:
            return None
        qwords = {w.lower() for w in self.nouns(question)}

        # 질문과 맞는 설명을 먼저, 모자라면 앞에서부터 채운다 (넓은 질문은 단어가 안 맞아도 설명 전체가 답의 재료다)
        scored = []
        for i, n in enumerate(notes):
            score, k = _match({w.lower() for w in self.nouns(n["text"])}, qwords, self.idf)
            scored.append((score if k else 0.0, -i, n))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        picked = [n for _, _, n in scored[:FALLBACK_NOTES]]

        # base: 검색이 이미 찾은 슬라이드 (있으면 그 위에 보강 자료를 더한다)
        by_page: dict[int, str] = {p: t for p, t in (base or {}).items() if p}
        general_lines = [f"[프로젝트 설명] {n['text']}" for n in picked if not n.get("page")]
        for n in picked:
            p = n.get("page")
            if not p:
                continue
            row = next((r for r in self.rows if r["page"] == p), None)
            if row is not None:
                by_page.setdefault(p, self._page_text(row))

        # 논리 지도: 질문과 맞는 줄거리 단계의 슬라이드를 붙이고, 줄거리 자체도 근거로 넘긴다
        story = ""
        if graph:
            for line in graph.get("story", []):
                lw = {w.lower() for w in self.nouns(line["text"])}
                if qwords & lw:
                    for p in line.get("pages", [])[:2]:
                        row = next((r for r in self.rows if r["page"] == p), None)
                        if row is not None and len(by_page) < FALLBACK_SLIDES + len(base or {}):
                            by_page.setdefault(p, self._page_text(row))
            story = deck_graph.story_text(graph)
            if story:
                general_lines.append("[발표 줄거리] " + " / ".join(s["text"] for s in graph.get("story", [])))
        if general_lines:
            by_page[0] = "\n".join(general_lines)
        # 검색 결과에 더한 게 없으면 다시 만들어도 같은 답이다
        if not by_page or (base and set(by_page) <= set(base) and by_page.get(0) == base.get(0)):
            return None
        return list(by_page.items()), story

    def _add_general(self, by_page: dict, question: str) -> list[tuple[int, str]]:
        general = self._general_notes(question)
        if general:
            by_page.setdefault(0, general)     # 0 = 특정 슬라이드가 아닌 설명
        return list(by_page.items())

    def set_core(self, cards: dict) -> None:
        """연습에서 확정한 기본 질문 카드 {질문 종류 id: 카드}. 확정이 바뀔 때마다 다시 넣는다."""
        self.core_cards = dict(cards or {})

    def _core_id(self, question: str) -> str | None:
        """기본 질문인가. 질문에 자료 고유의 내용어가 섞여 있으면 기본 질문으로 보지 않는다.

        "이 프로젝트의 한계는?" 은 기본 질문이고, "AI 탐지의 한계는?" 은 세부 질문이다.
        세부 질문에 저장된 기본 카드를 띄우면 엉뚱한 답이 된다.
        """
        cid = core_answers.classify(question)
        if not cid:
            return None
        core_words = [w for c in core_answers.CORE for w in c["words"]]
        rest = [w for w in _content_words(question, self.nouns)
                if not any(w in cw or cw in w for cw in core_words)]
        return None if rest else cid

    def _core_cue(self, question: str, card: dict, t0: float) -> Cue:
        srcs = []
        for step in card["steps"]:
            row = next((r for r in self.rows if r["page"] == step.get("slide")), None)
            if row is None or any(s.slide == row["page"] for s in srcs):
                continue
            i = self.rows.index(row)
            words = {w.lower() for w in self.nouns(step["text"])}
            line, _ = _score_lines(self.prepared[i], words, "사실확인", self.idf)
            srcs.append(Source(slide=row["page"], snippet=(line or row["text"])[:120], source=row["source"]))
        return Cue(question_type=classify(question), sources=srcs, status="ok", core=card,
                   mode=self.mode, stage="core", latency_ms=round((time.time() - t0) * 1000, 2))

    def _get_answerer(self):
        if self._answerer is None:
            from answer import Answerer
            self._answerer = Answerer()
        return self._answerer

    def set_expected(self, questions: list[dict]) -> None:
        """모의 디펜스에서 뽑아둔 예상 질문. 넣으면 적중률까지 기록한다."""
        self.expected = questions or []

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
