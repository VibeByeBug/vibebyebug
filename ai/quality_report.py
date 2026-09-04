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


def letters(text: str) -> int:
    return len(re.findall(r"[가-힣A-Za-z]", text))


def analyze(rows: list[dict]) -> dict:
    dead = [r for r in rows if letters(r["text"]) < MIN_LETTERS]
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
