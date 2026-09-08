"""사후 회고 리포트 — 쌓인 기록으로 다음 발표를 준비한다.

계획서 [사후] 단계다. 오늘 "재봐야 안다"고 미뤄둔 것들이 이 파일 하나로 답이 난다.

  질문이 실제로 얼마나 긴가        -> 요약 기능이 필요한지
  no_evidence 가 얼마나 자주 뜨나  -> 문턱값이 맞는지
  예상 질문 적중률                 -> 모의 디펜스가 쓸모 있었는지
  지연이 실제로 얼마인가           -> 프리셋이 맞는지

사용:
    python report.py                       # data/qa_log.jsonl 읽기
    python report.py data/qa_log.jsonl -w data/weak.json
"""

from __future__ import annotations

import argparse
import statistics as st
from pathlib import Path

import qa_log
from weak_profile import WeakProfile

BAR = "█"


def _bar(n: int, total: int, width: int = 24) -> str:
    return BAR * round(width * n / total) if total else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("log", nargs="?", type=Path, default=qa_log.DEFAULT_PATH)
    ap.add_argument("-w", "--weak", type=Path, default=None)
    a = ap.parse_args()

    rows = qa_log.load(a.log)
    if not rows:
        print(f"기록이 없습니다: {a.log}")
        print()
        print("실전에서 질문을 받으면 자동으로 쌓입니다. 모의 디펜스만 돌렸다면")
        print("weak.json 은 있어도 이 파일은 비어 있습니다 - 다른 기록입니다.")
        return 1

    s = qa_log.stats(rows)
    print("=" * 62)
    print(f"  사후 회고 리포트 · 질문 {s.total}개")
    print("=" * 62)

    # ── 무엇이 걸러졌나 ────────────────────────────────────────────
    print("\n[처리 결과]")
    label = {"ok": "근거 표시", "no_evidence": "근거 없음", "ignored": "잡음으로 무시"}
    for k in ("ok", "no_evidence", "ignored"):
        n = s.by_status.get(k, 0)
        print(f"  {label[k]:<12} {n:>3}개 {s.pct(n):>5}  {_bar(n, s.total)}")

    ne = s.by_status.get("no_evidence", 0)
    if s.total and ne / s.total > 0.3:
        print("\n  ! 근거 없음이 30% 를 넘는다. 둘 중 하나다.")
        print("    - 문턱값이 너무 빡빡하다 (pipeline.MIN_KNOWN_RATIO 를 낮춰볼 것)")
        print("    - 발표자료가 질문 범위를 못 덮는다 (자료를 보강해야 함)")

    # ── 질문 길이 - 요약 기능이 필요한가 ──────────────────────────
    if s.q_chars:
        med = st.median(s.q_chars)
        long_n = sum(1 for c in s.q_chars if c >= 60)
        print(f"\n[질문 길이]  중앙값 {med:.0f}자 · 최대 {s.q_chars[-1]}자")
        print(f"  60자 넘는 질문 {long_n}개 ({100*long_n/len(s.q_chars):.0f}%)")
        if long_n / len(s.q_chars) < 0.2:
            print("  -> 짧다. 질문 요약 기능은 필요 없어 보인다. 원문을 띄우는 편이 정확하다.")
        else:
            print("  -> 긴 질문이 꽤 된다. 요약 기능을 다시 검토할 만하다.")

    # ── 지연 - 프리셋이 맞는가 ────────────────────────────────────
    if s.latencies:
        p50 = s.latencies[len(s.latencies) // 2]
        p95 = s.latencies[min(len(s.latencies) - 1, int(len(s.latencies) * 0.95))]
        print(f"\n[지연]  보통 {p50:.0f}ms · 느릴 때 {p95:.0f}ms")
        if p95 > 1000:
            print("  ! 느릴 때가 1초를 넘는다. 더 가벼운 프리셋을 검토할 것.")
        else:
            print("  -> 1초 예산 안에 든다.")

    # ── 유형 분포 ────────────────────────────────────────────────
    if s.by_qtype:
        print("\n[질문 유형]")
        tot = sum(s.by_qtype.values())
        for k, n in sorted(s.by_qtype.items(), key=lambda x: -x[1]):
            print(f"  {k:<6} {n:>3}개 {100*n/tot:>4.0f}%  {_bar(n, tot)}")

    # ── 예상 질문 적중률 ─────────────────────────────────────────
    if s.hit_judged:
        print(f"\n[예상 질문 적중률]  {s.hits}/{s.hit_judged} "
              f"({100*s.hits/s.hit_judged:.0f}%)")
        missed = [r for r in rows
                  if isinstance(r.get("expected_hit"), dict)
                  and not r["expected_hit"].get("matched")]
        if missed:
            print("  연습에서 안 다룬 대목에서 나온 질문 (다음에 넣을 것):")
            for r in missed[:5]:
                print(f"    {r['question'][:52]}")
    else:
        print("\n[예상 질문 적중률]  기록 없음")
        print("  ReadyQ.set_expected(예상질문) 을 부르면 다음부터 남는다.")

    # ── 연습에서의 약점 ──────────────────────────────────────────
    if a.weak:
        w = WeakProfile.load(a.weak)
        if w:
            print(f"\n[연습에서 자주 놓친 근거]  (연습 {w.sessions}회 누적)")
            for line in w.summary()[:5]:
                print(f"  {line}")

    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
