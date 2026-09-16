"""질문 유형 분류를 LLM 없이 할 수 있는가.

Ready-Q 의 실시간 산출물은 '요약 1줄 + 유형 태그' 다. 유형 태그가 임베딩만으로 나오면
핫패스에서 LLM 호출이 0이 되고, 첫 렌더가 STT 지연에만 묶인다.

그래서 재는 것은 '정확도가 높은가' 가 아니라 '기준선을 넘는가' 다.
최다 클래스만 찍어도 46.7% 가 나오므로, 그걸 못 넘으면 분류기를 쓸 이유가 없다.

표본이 45개뿐이라 leave-one-out 교차검증을 쓴다. 그래도 잡음이 크다는 점은 감안해야 한다.

사용:
    python eval_typing.py data/questions_tomjelly.jsonl
    python eval_typing.py ... --embedder kure-v1
"""

from __future__ import annotations

import argparse
import json
import re
import time
from collections import Counter
from pathlib import Path

import numpy as np

from embedders import REGISTRY, STEmbedder

# 규칙 기준선. 임베딩이 이걸 못 이기면 굳이 모델을 올릴 이유가 없다.
# 순서가 중요하다 - 위에서부터 먼저 걸린다.
RULES = [
    ("한계반론", r"한계|배제|흔들|놓쳤|아닌가|않나요|예측할 수|전부 실제|믿어도"),
    ("근거",     r"왜 |왜하|근거|확인하셨|검증|사례가 있나"),
    ("절차",     r"어떻게|어떤 방식|어떤 기준|기준으로|순서|나누셨|나누신|처리하셨|바꾸신|추리신|쓰신 거"),
]


def rule_predict(q: str) -> str:
    for label, pat in RULES:
        if re.search(pat, q):
            return label
    return "사실확인"


def knn_predict(train_vecs, train_y, vec, k=3):
    sims = train_vecs @ vec
    top = np.argsort(-sims)[:k]
    # 유사도로 가중 투표 - 가까운 이웃에 더 힘을 준다
    score = {}
    for i in top:
        score[train_y[i]] = score.get(train_y[i], 0.0) + float(sims[i])
    return max(score.items(), key=lambda x: x[1])[0]


def report(name, y_true, y_pred, labels):
    acc = sum(a == b for a, b in zip(y_true, y_pred)) / len(y_true)
    print(f"\n  {name}: 정확도 {acc:.1%} ({sum(a==b for a,b in zip(y_true,y_pred))}/{len(y_true)})")
    for lab in labels:
        n = sum(1 for a in y_true if a == lab)
        hit = sum(1 for a, b in zip(y_true, y_pred) if a == lab and b == lab)
        pred_n = sum(1 for b in y_pred if b == lab)
        rec = hit / n if n else 0
        prec = hit / pred_n if pred_n else 0
        print(f"    {lab:<6} 재현 {rec:>5.0%} ({hit}/{n})   정밀 {prec:>5.0%} ({hit}/{pred_n})")
    return acc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("questions", type=Path)
    ap.add_argument("--embedder", default="bge-m3")
    ap.add_argument("--k", type=int, default=3)
    args = ap.parse_args()

    qs = [json.loads(l) for l in args.questions.open(encoding="utf-8")]
    qs = [q for q in qs if q.get("qtype")]
    texts = [q["question"] for q in qs]
    y = [q["qtype"] for q in qs]
    labels = [l for l, _ in Counter(y).most_common()]
    n = len(qs)

    print(f"질문 {n}개 / 유형 {len(labels)}종")
    for lab in labels:
        print(f"  {lab:<6} {y.count(lab):>2}개")

    major = Counter(y).most_common(1)[0][0]
    base_acc = report("기준선 · 최다 클래스만 찍기", y, [major] * n, labels)
    rule_acc = report("기준선 · 키워드 규칙", y, [rule_predict(t) for t in texts], labels)

    # 임베딩 + kNN, leave-one-out
    emb = REGISTRY[args.embedder]()
    if not isinstance(emb, STEmbedder):
        print("임베딩 검색기가 아닙니다")
        return 1
    t0 = time.time()
    V = emb._encode(texts)
    t_encode = (time.time() - t0) / n

    pred = []
    for i in range(n):
        mask = np.arange(n) != i
        pred.append(knn_predict(V[mask], [y[j] for j in range(n) if j != i], V[i], args.k))
    knn_acc = report(f"임베딩({args.embedder}) + kNN(k={args.k})", y, pred, labels)

    print(f"\n  질문 1개 인코딩 시간: {t_encode*1000:.1f}ms")
    print("\n" + "=" * 60)
    best = max([("최다 클래스", base_acc), ("키워드 규칙", rule_acc),
                (f"임베딩+kNN", knn_acc)], key=lambda x: x[1])
    print(f"  1위: {best[0]} {best[1]:.1%}")
    if knn_acc <= base_acc:
        print("  판정: 임베딩이 기준선을 못 넘었다. 분류기를 쓸 이유가 없다.")
    elif knn_acc <= rule_acc:
        print("  판정: 규칙이 임베딩과 같거나 낫다. 규칙을 쓰면 0ms 에 끝난다.")
    else:
        print(f"  판정: 임베딩이 규칙보다 {knn_acc-rule_acc:+.1%}. "
              f"{t_encode*1000:.0f}ms 를 쓸 값어치가 있는지 판단할 것.")
    print("  주의: 표본 45개다. 정확도 1%p 는 질문 0.45개다. 방향만 보라.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
