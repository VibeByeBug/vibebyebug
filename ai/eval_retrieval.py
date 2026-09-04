"""검색기 bake-off — 어느 검색 방식이 정답 슬라이드를 잘 찾는지 잰다.

지표:
  Recall@k  정답 슬라이드가 상위 k 개 안에 든 질문의 비율
  MRR       정답이 몇 등으로 나왔는지 (1등=1.0, 2등=0.5, 3등=0.33)

Ready-Q 는 화면에 근거를 2~3개만 띄우므로 Recall@3 이 사실상의 합격 기준이다.
정답이 7등이면 발표자 눈에는 안 보인다.

사용:
    python eval_retrieval.py data/chunks_x.jsonl data/questions_x.jsonl
    python eval_retrieval.py ... --retrievers bm25,bge-m3
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from embedders import REGISTRY, Hybrid

KS = (1, 3, 5)


def evaluate(retriever, docs, questions, gold_sets):
    t0 = time.time()
    retriever.index(docs)
    t_index = time.time() - t0

    t0 = time.time()
    results = retriever.search([q["question"] for q in questions], max(KS))
    t_search = time.time() - t0

    recall = {k: 0 for k in KS}
    rr_total = 0.0
    misses = []
    for q, res, gold in zip(questions, results, gold_sets):
        ranked = [i for i, _ in res]
        hit = [r for r, i in enumerate(ranked) if i in gold]
        if hit:
            rank = hit[0]
            rr_total += 1 / (rank + 1)
            for k in KS:
                if rank < k:
                    recall[k] += 1
            if rank >= 3:
                misses.append((q["question"], q["gold_page"], rank + 1))
        else:
            misses.append((q["question"], q["gold_page"], None))

    n = len(questions)
    return {
        "name": retriever.name,
        "recall": {k: recall[k] / n for k in KS},
        "mrr": rr_total / n,
        "t_index": t_index,
        "t_search_per_q": t_search / n,
        "misses": misses,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chunks", type=Path)
    ap.add_argument("questions", type=Path)
    ap.add_argument("--retrievers", default="bm25,bge-m3,kure-v1")
    ap.add_argument("--hybrid", default="bm25+bge-m3",
                    help="RRF 로 합칠 두 검색기, 빈 문자열이면 생략")
    ap.add_argument("--show-misses", type=int, default=5)
    args = ap.parse_args()

    rows = [json.loads(l) for l in args.chunks.open(encoding="utf-8")]
    docs = [r["text"] for r in rows]
    # 여러 자료를 합치면 페이지 번호가 겹치므로 id 로 찾는다.
    # (page 만 쓰면 "4번 슬라이드"가 자료 수만큼 생겨 엉뚱한 문서를 정답으로 센다)
    id_to_idx = {r["id"]: i for i, r in enumerate(rows)}
    page_to_idx = {r["page"]: i for i, r in enumerate(rows)}

    questions = [json.loads(l) for l in args.questions.open(encoding="utf-8")]
    # 같은 내용이 여러 슬라이드에 반복되는 발표가 많아 정답을 여러 개 허용한다.
    # 정답이 하나뿐이면 검색기가 맞는 슬라이드를 찾고도 오답 처리된다.
    def golds(q):
        if q.get("gold_ids"):
            return {id_to_idx[i] for i in q["gold_ids"] if i in id_to_idx}
        if q.get("gold_id"):
            return {id_to_idx[q["gold_id"]]} if q["gold_id"] in id_to_idx else set()
        pages = q.get("gold_pages") or [q["gold_page"]]
        return {page_to_idx[p] for p in pages if p in page_to_idx}

    questions = [q for q in questions if golds(q)]
    gold_sets = [golds(q) for q in questions]

    print(f"문서 {len(docs)}장 / 질문 {len(questions)}개\n")

    names = [n.strip() for n in args.retrievers.split(",") if n.strip()]
    built = {}
    reports = []
    for name in names:
        if name not in REGISTRY:
            print(f"  알 수 없는 검색기: {name} (가능: {', '.join(REGISTRY)})")
            continue
        print(f"  {name} 실행 중...", flush=True)
        try:
            r = REGISTRY[name]()
            built[name] = r
            reports.append(evaluate(r, docs, questions, gold_sets))
        except Exception as e:
            print(f"    실패: {type(e).__name__}: {e}")

    if args.hybrid and "+" in args.hybrid:
        a, b = [x.strip() for x in args.hybrid.split("+", 1)]
        if a in built and b in built:
            print(f"  hybrid({a}+{b}) 실행 중...", flush=True)
            try:
                reports.append(evaluate(Hybrid(built[a], built[b]), docs,
                                        questions, gold_sets))
            except Exception as e:
                print(f"    실패: {e}")

    if not reports:
        print("\n실행된 검색기가 없습니다.")
        return 1

    print("\n" + "=" * 74)
    print(f"{'검색기':<24} {'R@1':>7} {'R@3':>7} {'R@5':>7} {'MRR':>7} {'질의ms':>8}")
    print("-" * 74)
    for r in sorted(reports, key=lambda x: -x["recall"][3]):
        print(f"{r['name']:<24} "
              f"{r['recall'][1]:>7.1%} {r['recall'][3]:>7.1%} {r['recall'][5]:>7.1%} "
              f"{r['mrr']:>7.3f} {r['t_search_per_q'] * 1000:>8.1f}")
    print("=" * 74)

    best = max(reports, key=lambda x: x["recall"][3])
    print(f"\nRecall@3 기준 1위: {best['name']} ({best['recall'][3]:.1%})")

    if args.show_misses and best["misses"]:
        print(f"\n{best['name']} 이(가) 놓친 질문 (상위 3위 밖):")
        for q, page, rank in best["misses"][:args.show_misses]:
            where = f"{rank}위" if rank else "5위 밖"
            print(f"  [{where}] p{page} <- {q[:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
