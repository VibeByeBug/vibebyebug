"""근거 없음 문턱값을 실제 질문으로 잡는다.

MIN_KNOWN_RATIO 를 감으로 정하면 둘 중 하나가 된다.
  너무 낮으면 - 무관한 질문에도 엉뚱한 근거가 뜬다
  너무 높으면 - 멀쩡한 질문을 "근거 없음"으로 막는다

관련 질문과 무관한 질문을 같이 넣고, 둘을 가장 잘 가르는 값을 찾는다.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pipeline import ReadyQ, known_ratio, is_noise

# 발표자료와 아무 상관 없는 질문. 실제로 나올 법한 것들로.
UNRELATED = [
    "점심은 뭐 드셨어요?",
    "이 프로젝트 예산이 얼마나 들었나요?",
    "팀원은 몇 명이신가요?",
    "머신러닝이 정확히 뭔가요?",
    "다음 학기에도 이걸 계속 하시나요?",
    "발표 자료는 누가 만드셨어요?",
    "혹시 창업할 생각도 있으신가요?",
    "논문으로 낼 계획이 있으신가요?",
    "개발 기간은 얼마나 걸렸나요?",
    "다른 학교랑 협업하신 건가요?",
]

# 잡음. STT 가 헛기침이나 소음을 옮긴 형태.
NOISE = ["", "  ", "어", "음...", "그", "아 네", "어 그", "음 저기", "네네", "그니까"]


def main() -> int:
    chunks = Path(sys.argv[1] if len(sys.argv) > 1 else "data/chunks_tomjelly.jsonl")
    qs = Path(sys.argv[2] if len(sys.argv) > 2 else "data/questions_tomjelly.jsonl")

    rq = ReadyQ(chunks, preset="fast")
    related = [json.loads(l)["question"] for l in qs.open(encoding="utf-8")]

    print(f"관련 질문 {len(related)}개 / 무관한 질문 {len(UNRELATED)}개 / 잡음 {len(NOISE)}개\n")

    # 잡음부터 - 문턱값과 무관하게 걸러져야 한다
    caught = sum(1 for t in NOISE if is_noise(t, rq.nouns))
    leaked = [t for t in related if is_noise(t, rq.nouns)]
    print(f"[잡음 방어] 잡음 {caught}/{len(NOISE)} 차단, 정상 질문 오차단 {len(leaked)}건")
    if leaked:
        print(f"  오차단: {leaked}")

    r_rel = sorted(known_ratio(q, rq.nouns, rq.idf) for q in related)
    r_unr = sorted(known_ratio(q, rq.nouns, rq.idf) for q in UNRELATED)

    print(f"\n[낱말 일치율]")
    print(f"  관련 질문   최소 {r_rel[0]:.2f}  중앙 {r_rel[len(r_rel)//2]:.2f}  최대 {r_rel[-1]:.2f}")
    print(f"  무관한 질문 최소 {r_unr[0]:.2f}  중앙 {r_unr[len(r_unr)//2]:.2f}  최대 {r_unr[-1]:.2f}")

    print(f"\n[문턱값별 결과]")
    print(f"  {'문턱':>6} {'정상 통과':>10} {'무관 차단':>10}")
    scored = []
    for th in [i / 100 for i in range(0, 101, 2)]:
        keep = sum(1 for r in r_rel if r >= th) / len(r_rel)
        block = sum(1 for r in r_unr if r < th) / len(r_unr)
        # 정상 질문을 막는 게 더 나쁘다. 무관한 걸 통과시키면 근거가 뜰 뿐이지만
        # 정상 질문을 막으면 발표자가 아무것도 못 본다.
        scored.append((keep * 2 + block, th))
        if th in (0.0, 0.2, 0.3, 0.34, 0.4, 0.5, 0.6, 0.8):
            print(f"  {th:>6.2f} {keep:>9.0%} {block:>10.0%}")
    top = max(s for s, _ in scored)
    tied = [t for s, t in scored if s == top]
    # 동률이면 구간 한가운데를 고른다. 끝값은 양쪽 표본이 조금만 움직여도 무너진다.
    best = tied[len(tied) // 2]
    keep = sum(1 for r in r_rel if r >= best) / len(r_rel)
    block = sum(1 for r in r_unr if r < best) / len(r_unr)
    print(f"\n  권장 문턱값 {best:.2f}  (정상 통과 {keep:.0%}, 무관 차단 {block:.0%})")
    print("  * 정상 질문을 막는 쪽에 두 배 벌점을 줬다. 근거가 안 뜨는 것보다")
    print("    엉뚱한 근거가 뜨는 편이 그나마 낫기 때문이다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
