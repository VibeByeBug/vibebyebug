"""데모용 실측 데이터 생성 - 실제 파이프라인을 돌려 1단계/2단계 결과를 뽑는다."""
import json, sys, time
sys.path.insert(0, '.')
from pipeline import ReadyQ

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

t0 = time.time()
rq = ReadyQ("data/chunks_tomjelly.jsonl")
print(f"색인 {time.time()-t0:.1f}초", flush=True)
t0 = time.time()
rq.warm()
warm_s = time.time() - t0
print(f"임베딩 로딩 {warm_s:.1f}초", flush=True)

rq.fast_cue("워밍업")            # 첫 호출 편향 제거
rq.refined_cue("워밍업")

out = []
for q in QUESTIONS:
    f = rq.fast_cue(q, k=5)
    r = rq.refined_cue(q, k=5)
    out.append({
        "question": q,
        "fast": f.to_message(),
        "refined": r.to_message(),
        "changed": [s.slide for s in f.sources[:3]] != [s.slide for s in r.sources[:3]],
    })
    print(f"  {q[:30]}  {f.latency_ms:.1f}ms -> {r.latency_ms:.1f}ms  "
          f"{'바뀜' if out[-1]['changed'] else '동일'}", flush=True)

json.dump({"warm_seconds": round(warm_s, 1), "cases": out},
          open("data/demo_cases.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
n_changed = sum(1 for c in out if c["changed"])
print(f"\n2단계에서 순서가 바뀐 질문: {n_changed}/{len(out)}")
