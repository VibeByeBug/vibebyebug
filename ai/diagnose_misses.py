"""검색이 틀린 질문에 대해, 정답 대신 무엇이 올라왔는지 본다.

점수만 보면 '틀렸다'까지만 알 수 있다. 무엇에 밀렸는지를 봐야 고칠 방법이 보인다.

사용:
    python diagnose_misses.py data/chunks_all.jsonl data/questions_tomjelly.jsonl
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from embedders import REGISTRY, Hybrid, _tokens


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chunks", type=Path)
    ap.add_argument("questions", type=Path)
    ap.add_argument("--k", type=int, default=3)
    args = ap.parse_args()

    rows = [json.loads(l) for l in args.chunks.open(encoding="utf-8")]
    docs = [r["text"] for r in rows]
    id_to_idx = {r["id"]: i for i, r in enumerate(rows)}

    qs = [json.loads(l) for l in args.questions.open(encoding="utf-8")]

    r = Hybrid(REGISTRY["bm25"](), REGISTRY["bge-m3"]())
    r.index(docs)
    res = r.search([q["question"] for q in qs], 20)

    misses = []
    for q, hits in zip(qs, res):
        gold = {id_to_idx[i] for i in q["gold_ids"] if i in id_to_idx}
        ranked = [i for i, _ in hits]
        pos = next((n for n, i in enumerate(ranked) if i in gold), None)
        if pos is None or pos >= args.k:
            misses.append((q, ranked, pos, gold))

    print(f"상위 {args.k} 안에 못 넣은 질문: {len(misses)}/{len(qs)}\n")
    for q, ranked, pos, gold in misses:
        gi = sorted(gold)[0]
        print("=" * 72)
        print(f"Q. {q['question']}")
        print(f"   정답: {rows[gi]['id']}  (실제 순위: {pos + 1 if pos is not None else '20위 밖'})")
        print(f"   정답 슬라이드에서 겹치는 단어: "
              f"{sorted(set(_tokens(q['question'])) & set(_tokens(rows[gi]['text'])))[:12]}")
        print("   대신 올라온 것:")
        for n, i in enumerate(ranked[:3], 1):
            mark = " <-정답" if i in gold else ""
            print(f"     {n}. {rows[i]['id']}{mark}")
            print(f"        {rows[i]['text'][:90].replace(chr(10), ' ')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
