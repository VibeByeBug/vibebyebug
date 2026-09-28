"""청크 추출 품질 게이트.

Ready-Q의 전제는 "원본 자료에서 근거를 찾아준다" 이다.
텍스트가 추출되지 않은 슬라이드는 검색에 영원히 안 잡히므로,
발표자는 '시스템이 못 보는 구간'을 모른 채 신뢰하게 된다. 이게 무근거 답변보다 위험하다.

따라서 이 리포트는 개발용 진단이자 제품 기능이다.
업로드 시점에 "N번 슬라이드는 근거로 못 씁니다" 를 발표자에게 알려줘야 한다.

사용:
    python quality_report.py [data/chunks.jsonl]
"""

from __future__ import annotations

import json
import re
import statistics as st
import sys
from pathlib import Path

# 본문 없이 이것만 추출되면 '글머리표만 남은' 슬라이드 = 본문이 이미지/도형
GLYPH_ONLY = re.compile(
    r"^[\s\u2022\u25aa\u25cf\u2756\u2713\u2219\u00b7\u2010-\u2015\-\*"
    r"\u25a0\u25b6\u2192\u27a2\u25ab\u2043\u25e6]+$"
)

# 이 아래면 검색 대상으로 무의미하다고 본 기준 (한글+영문 글자 수)
MIN_LETTERS = 20

_HANGUL = re.compile(r"[가-힣]")


def letters(text: str) -> int:
    return len(re.findall(r"[가-힣A-Za-z]", text))


def garbled(text: str, min_syllables: int = 15, max_top_ratio: float = 0.25) -> bool:
    """PDF 글꼴이 깨져 엉뚱한 음절로 뒤바뀐 슬라이드를 잡는다.

    글자 수는 멀쩡해 보여도(MIN_LETTERS 는 통과) 실제로는 몇 안 되는 음절이 반복될 뿐인 경우가 있다.
    PowerPoint 등에서 내보낸 PDF 의 임베디드 폰트에 글자-코드 매핑(ToUnicode)이 빠지거나 깨지면
    PyMuPDF 가 "문문문문", "세세세세" 처럼 엉뚱한 음절을 그대로 뽑는다 — 우리 쪽 처리 전에 이미 이렇다.
    실제로 겪은 사례: 23장 중 16장이 이 증상이었는데, MIN_LETTERS 만 보는 기준으로는 전부 "양호"였다.

    기준은 "가장 많이 나온 음절의 비율" 하나만 본다. "고유 음절 비율"도 같이 써봤는데,
    실전 슬라이드 하나(UI 화면을 옮겨 적은 긴 캡션, 450자)가 정상인데도 조사·흔한 낱말이
    자연스럽게 반복돼 고유 비율이 0.34 까지 떨어져 오탐이 났다. 반면 실제로 깨진 장은 한
    음절이 30~100% 를 차지해서(예: "세"가 453자 중 250자), 이 값만으로도 뚜렷하게 갈린다.
    """
    syls = _HANGUL.findall(text)
    if len(syls) < min_syllables:
        return False
    top = max((syls.count(s) for s in set(syls)), default=0)
    return (top / len(syls)) > max_top_ratio


def first_readable_line(text: str, max_len: int | None = None) -> str:
    """"첫 줄"이 아니라 "폰트가 안 깨진 첫 줄"을 고른다. 슬라이드 제목, 지도 이름표에 쓴다.

    깨진 PDF 는 페이지 전체가 아니라 제목 텍스트박스만 다른(깨진) 폰트인 경우가 있었다
    (실제로 겪음: 본문은 멀쩡한데 제목 줄만 "문문문" 처럼 나옴). garbled() 의 기준은 줄 하나에는
    너무 느슨해서(최소 15음절), 짧은 줄 전용으로 더 엄격한 기준을 쓴다.
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines:
        # 페이지 번호("15")나 구분 기호만 있는 줄은 안 깨졌어도 제목감이 아니다
        if letters(line) >= 2 and not _line_garbled(line):
            return line[:max_len] if max_len else line
    # 전부 깨졌으면(드묾) 그래도 첫 줄을 돌려준다 — 빈 제목보다는 낫다
    first = lines[0] if lines else ""
    return first[:max_len] if max_len else first


def _line_garbled(line: str) -> bool:
    syls = _HANGUL.findall(line)
    if len(syls) < 2:
        return False
    uniq = set(syls)
    top = max((syls.count(s) for s in uniq), default=0)
    return (len(uniq) / len(syls)) < 0.5 or (top / len(syls)) > 0.4


def analyze(rows: list[dict]) -> dict:
    dead = [r for r in rows if letters(r["text"]) < MIN_LETTERS or garbled(r["text"])]
    glyph = [r for r in rows if GLYPH_ONLY.match(r["text"])]
    # 글머리표는 나오는데 본문이 짧음 = 본문이 이미지로 깔린 전형적 패턴
    bullet_no_body = [
        r for r in rows
        if re.search(r"[\u2022\u2756\u27a2\u2713]", r["text"]) and letters(r["text"]) < 60
    ]
    return {
        "total": len(rows),
        "dead": dead,
        "glyph": glyph,
        "bullet_no_body": bullet_no_body,
        "median_letters": st.median([letters(r["text"]) for r in rows]) if rows else 0,
    }


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/chunks.jsonl")
    rows = [json.loads(line) for line in path.open(encoding="utf-8")]
    a = analyze(rows)
    total = a["total"]

    def pct(n: int) -> str:
        return f"{n:>3}/{total} ({100 * n / total:.0f}%)" if total else "0"

    print(f"[추출 품질] {path}")
    print(f"  슬라이드 총계          : {total}")
    print(f"  슬라이드당 글자수 중앙값: {a['median_letters']:.0f}")
    print(f"  검색 불가(글자<{MIN_LETTERS}) : {pct(len(a['dead']))}  <- RAG가 못 보는 구간")
    print(f"  글머리표만 남음        : {pct(len(a['glyph']))}")
    print(f"  본문이 이미지로 추정   : {pct(len(a['bullet_no_body']))}")

    if a["dead"]:
        pages = [r["page"] for r in a["dead"]]
        print(f"\n  검색 불가 슬라이드: {pages[:25]}{' ...' if len(pages) > 25 else ''}")

    ratio = len(a["dead"]) / total if total else 0
    print()
    if ratio > 0.15:
        print("  판정: 실패. 이 자료로는 RAG 품질을 신뢰할 수 없다.")
        print("        -> 이미지 슬라이드를 멀티모달 모델로 캡션 처리하는 경로가 필요하다.")
        return 2
    if ratio > 0.05:
        print("  판정: 경고. 일부 슬라이드가 근거로 안 잡힌다. 발표자에게 고지할 것.")
        return 1
    print("  판정: 양호. 임베딩 bake-off 진행 가능.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
