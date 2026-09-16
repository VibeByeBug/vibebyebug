"""추천 답변 측정 - 손으로 쓴 질문으로 속도, 차단, 답변 내용을 본다.

    python eval_answer.py data/chunks_x.jsonl data/questions_x.jsonl -o data/lab/answers_x.jsonl
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from pipeline import ReadyQ


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chunks", type=Path)
    ap.add_argument("questions", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("data/lab/answers.jsonl"))
    a = ap.parse_args()

    rq = ReadyQ(a.chunks, log_path=None, mode="answer")
    rq.warm()
    qs = [json.loads(l) for l in a.questions.open(encoding="utf-8")]

    out, status, first, total = [], Counter(), [], []
    for q in qs:
        cue = rq.cue(q["question"])
        last = None
        for m in rq.answer(q["question"], cue):
            last = m
        status[last["status"]] += 1
        if last["status"] == "ok":
            first.append(last["first_ms"])
            total.append(last["latency_ms"])
        out.append({"question": q["question"], "slides": [s.slide for s in cue.sources],
                    "gold_pages": q.get("gold_pages"), **last})
        print(f"[{last['status']:<9}] {last['latency_ms']:>6.0f}ms | {q['question'][:40]}")
        print(f"    {last['text'][:160]}")
        if last.get("note"):
            print(f"    note: {last['note'][:120]}")

    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print("\n결과:", dict(status))
    print(f"첫 문장  p50 {pct(first, .5):.0f}ms  p95 {pct(first, .95):.0f}ms")
    print(f"끝      p50 {pct(total, .5):.0f}ms  p95 {pct(total, .95):.0f}ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
