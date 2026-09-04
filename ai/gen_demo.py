"""데모용 실측 데이터 - 실제 파이프라인을 돌려 1단계/2단계 결과와 지연을 뽑는다.

데모의 목적은 하나다: 2단계에서 화면이 바뀌는 걸 발표자가 견딜 수 있는지 눈으로 보는 것.
그래서 지연도 결과도 실측값을 쓴다. 꾸며낸 타이밍으로는 판단할 수 없다.
"""
import json, sys, time
sys.path.insert(0, '.')
from pipeline import ReadyQ, DEFAULT_PRESET

QUESTIONS = [
    "포트홀 보수 이력은 얼마나 모으신 거예요?",
    "반복 보수가 많은 곳이 진짜 위험한 게 맞는지 어떻게 확인하셨어요?",
    "AI 성능이 전체적으로 어느 정도 나왔나요?",
    "이 분석의 한계는 뭐라고 보시나요?",
    "순위를 매길 때 뭘 먼저 보고 정하신 건가요?",
    "왜 하필 하수관에 주목하신 거예요?",
    "조사 구역은 최종적으로 몇 개 나왔나요?",
    "개별 사고를 미리 예측할 수 있는 건가요?",
]

rq = ReadyQ("data/chunks_tomjelly.jsonl")
t0 = time.time(); rq.warm(); warm_s = time.time() - t0
print(f"프리셋 {DEFAULT_PRESET} / warm {warm_s:.1f}초", flush=True)

rq.fast_cue("워밍업"); rq.refined_cue("워밍업")

cases = []
for q in QUESTIONS:
    f = rq.fast_cue(q, k=3)
    r = rq.refined_cue(q, k=3)
    fs = [s.slide for s in f.sources]
    rs = [s.slide for s in r.sources]
    cases.append({
        "question": q,
        "qtype": f.question_type,
        "fast": {"latency_ms": f.latency_ms, "keywords": f.keywords,
                 "sources": [{"slide": s.slide, "snippet": s.snippet} for s in f.sources]},
        "refined": {"latency_ms": r.latency_ms, "keywords": r.keywords,
                    "sources": [{"slide": s.slide, "snippet": s.snippet} for s in r.sources]},
        "deflect": f.deflect,
        "top1_changed": fs[:1] != rs[:1],
        "top3_changed": fs != rs,
    })
    print(f"  {q[:26]:<28} {f.latency_ms:>6.1f} -> {r.latency_ms:>7.1f}ms  "
          f"{fs} -> {rs}  {'1위바뀜' if cases[-1]['top1_changed'] else ('순서바뀜' if cases[-1]['top3_changed'] else '동일')}",
          flush=True)

json.dump({"preset": DEFAULT_PRESET, "warm_seconds": round(warm_s, 1), "cases": cases},
          open("data/demo_cases.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n1위 바뀜 {sum(c['top1_changed'] for c in cases)}/{len(cases)}  "
      f"상위3 바뀜 {sum(c['top3_changed'] for c in cases)}/{len(cases)}")
