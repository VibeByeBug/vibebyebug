"""검색기 어댑터 — 임베딩 모델과 BM25 를 같은 인터페이스로 묶는다.

어느 게 나은지는 재봐야 안다. 특히 BM25 를 기준선으로 반드시 둔다:
발표 Q&A 질문은 고유명사와 숫자를 물어보는 비중이 높아서, 단순 단어 매칭이
임베딩을 이기는 경우가 드물지 않다. 기준선이 없으면 그 사실을 못 본다.

모든 검색기는 search(queries, k) -> 각 질의별 (문서인덱스, 점수) 목록을 돌려준다.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np


class Retriever:
    name = "base"

    def index(self, docs: list[str]) -> None:
        raise NotImplementedError

    def search(self, queries: list[str], k: int) -> list[list[tuple[int, float]]]:
        raise NotImplementedError


# --- BM25 (기준선, 의존성 없음) --------------------------------------------

def _tokens(text: str) -> list[str]:
    """한국어는 형태소 분석기 없이 '어절 + 글자 2-gram' 으로도 충분히 잡힌다.

    숫자와 영문은 통째로 남긴다 ('94,469', 'CCTV' 가 쪼개지면 안 된다).
    """
    out = []
    for tok in re.findall(r"[0-9][0-9,.]*|[A-Za-z]+|[가-힣]+", text.lower()):
        out.append(tok)
        if re.match(r"^[가-힣]+$", tok) and len(tok) > 1:
            out.extend(tok[i:i + 2] for i in range(len(tok) - 1))
    return out


class BM25(Retriever):
    name = "bm25"

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b

    def index(self, docs: list[str]) -> None:
        self.docs = [_tokens(d) for d in docs]
        self.N = len(self.docs)
        self.avgdl = sum(len(d) for d in self.docs) / max(self.N, 1)
        self.tf = [Counter(d) for d in self.docs]
        df = Counter()
        for d in self.docs:
            df.update(set(d))
        self.idf = {
            t: math.log(1 + (self.N - n + 0.5) / (n + 0.5)) for t, n in df.items()
        }

    def search(self, queries, k):
        results = []
        for q in queries:
            scores = np.zeros(self.N)
            for t in _tokens(q):
                idf = self.idf.get(t)
                if idf is None:
                    continue
                for i, tf in enumerate(self.tf):
                    f = tf.get(t, 0)
                    if f:
                        dl = len(self.docs[i])
                        scores[i] += idf * f * (self.k1 + 1) / (
                            f + self.k1 * (1 - self.b + self.b * dl / self.avgdl)
                        )
            top = np.argsort(-scores)[:k]
            results.append([(int(i), float(scores[i])) for i in top])
        return results


# --- 임베딩 (sentence-transformers) ---------------------------------------

class STEmbedder(Retriever):
    """로컬 임베딩 모델. 네트워크 왕복이 없고 비용이 0이다."""

    def __init__(self, model_id: str, name: str | None = None):
        self.model_id = model_id
        self.name = name or model_id.split("/")[-1]
        self._model = None

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_id)
        return self._model

    def _encode(self, texts: list[str]) -> np.ndarray:
        v = self._load().encode(texts, normalize_embeddings=True,
                                batch_size=8, show_progress_bar=False)
        return np.asarray(v, dtype=np.float32)

    def index(self, docs: list[str]) -> None:
        self.doc_vecs = self._encode(docs)

    def search(self, queries, k):
        qv = self._encode(queries)
        sims = qv @ self.doc_vecs.T          # 정규화했으므로 내적 = 코사인
        results = []
        for row in sims:
            top = np.argsort(-row)[:k]
            results.append([(int(i), float(row[i])) for i in top])
        return results


# --- 임베딩 (Gemini API) ---------------------------------------------------

class GeminiEmbedder(Retriever):
    """API 임베딩. 로컬 모델과 달리 네트워크 지연과 사용량 제한이 붙는다."""

    name = "gemini-embed"

    def __init__(self, model_id: str = "gemini-embedding-001"):
        self.model_id = model_id

    def _encode(self, texts: list[str], task: str) -> np.ndarray:
        from google import genai
        from google.genai import types
        client = genai.Client()
        vecs = []
        for i in range(0, len(texts), 8):        # 무료 등급 배려해 작게 끊는다
            r = client.models.embed_content(
                model=self.model_id, contents=texts[i:i + 8],
                config=types.EmbedContentConfig(task_type=task))
            vecs.extend(e.values for e in r.embeddings)
        v = np.asarray(vecs, dtype=np.float32)
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def index(self, docs):
        self.doc_vecs = self._encode(docs, "RETRIEVAL_DOCUMENT")

    def search(self, queries, k):
        qv = self._encode(queries, "RETRIEVAL_QUERY")
        sims = qv @ self.doc_vecs.T
        return [[(int(i), float(row[i])) for i in np.argsort(-row)[:k]] for row in sims]


# --- 하이브리드 -------------------------------------------------------------

class Hybrid(Retriever):
    """BM25 와 임베딩 순위를 합친다(RRF).

    점수 스케일이 서로 달라 그냥 더하면 안 되므로, 점수 대신 '순위'를 쓴다.
    """

    def __init__(self, a: Retriever, b: Retriever, k_rrf: int = 60):
        self.a, self.b, self.k_rrf = a, b, k_rrf
        self.name = f"hybrid({a.name}+{b.name})"

    def index(self, docs):
        self.a.index(docs)
        self.b.index(docs)
        self.n = len(docs)

    def search(self, queries, k):
        ra = self.a.search(queries, self.n)
        rb = self.b.search(queries, self.n)
        out = []
        for la, lb in zip(ra, rb):
            score = {}
            for rank, (i, _) in enumerate(la):
                score[i] = score.get(i, 0) + 1 / (self.k_rrf + rank + 1)
            for rank, (i, _) in enumerate(lb):
                score[i] = score.get(i, 0) + 1 / (self.k_rrf + rank + 1)
            top = sorted(score.items(), key=lambda x: -x[1])[:k]
            out.append([(i, float(s)) for i, s in top])
        return out



# --- 구간 단위 채점 ------------------------------------------------------

class MaxPassage(Retriever):
    """슬라이드를 겹치는 구간으로 쪼개 채점하고, 슬라이드당 최고점만 남긴다.

    왜 필요한가:
    절차형 질문("순위를 매길 때 뭘 먼저 보나요")의 답은 긴 슬라이드 안의 한 줄
    ("선정 규칙 : (1) 사고 유무 -> (2) 보수 횟수")에 있다. 슬라이드 전체를 하나로
    채점하면, 처음부터 끝까지 그 주제인 다른 슬라이드가 이겨버린다.
    구간으로 쪼개면 '답이 있는 한 줄'이 그 구간을 대표하게 되어 경쟁이 가능해진다.

    인용 단위는 그대로 슬라이드다. 채점만 구간에서 하고 출처는 슬라이드로 돌려준다.
    """

    def __init__(self, inner: Retriever, window: int = 220, stride: int = 110):
        self.inner, self.window, self.stride = inner, window, stride
        self.name = f"maxpass({inner.name})"

    def _split(self, text: str) -> list[str]:
        # 줄 단위를 유지하면서 window 글자쯤 모아 구간을 만든다.
        # 줄 중간에서 자르면 "(1) 사고 유무 -> (2) 보수 횟수" 같은 한 줄이 두 동강 난다.
        lines = [x for x in text.split(chr(10)) if x.strip()]
        if not lines:
            return [text]
        chunks, cur, n = [], [], 0
        for line in lines:
            cur.append(line)
            n += len(line)
            if n >= self.window:
                chunks.append(chr(10).join(cur))
                # stride 만큼 겹치도록 뒤쪽 줄을 남긴다
                keep, kn = [], 0
                for l in reversed(cur):
                    if kn >= self.stride:
                        break
                    keep.insert(0, l)
                    kn += len(l)
                cur, n = keep, kn
        if cur:
            chunks.append(chr(10).join(cur))
        return chunks or [text]

    def index(self, docs: list[str]) -> None:
        self.owner = []          # 구간 -> 원래 문서 번호
        passages = []
        for i, d in enumerate(docs):
            for c in self._split(d):
                passages.append(c)
                self.owner.append(i)
        self.n_docs = len(docs)
        self.inner.index(passages)

    def search(self, queries, k):
        # 구간이 문서보다 많으므로 넉넉히 뽑아 문서 단위로 접는다
        raw = self.inner.search(queries, min(len(self.owner), max(k * 12, 60)))
        out = []
        for hits in raw:
            best = {}
            for pi, score in hits:
                d = self.owner[pi]
                if score > best.get(d, float("-inf")):
                    best[d] = score
            top = sorted(best.items(), key=lambda x: -x[1])[:k]
            out.append([(int(d), float(s)) for d, s in top])
        return out


class QueryExpand(Retriever):
    """[실험용] 질의만 바꿔서 안쪽 검색기에 넘긴다. 문서 색인은 건드리지 않는다.

    유형별 확장어를 붙여 어휘 격차를 메우는 용도다(qtype.expand 참고).
    검색기 자체는 그대로이므로, 확장이 손해면 이 껍데기만 벗기면 된다.
    """

    def __init__(self, inner: Retriever, fn):
        self.inner, self.fn = inner, fn
        self.name = f"expand({inner.name})"

    def index(self, docs):
        self.inner.index(docs)

    def search(self, queries, k):
        return self.inner.search([self.fn(q) for q in queries], k)

REGISTRY = {
    "bm25": lambda: BM25(),
    "bge-m3": lambda: STEmbedder("BAAI/bge-m3"),
    "kure-v1": lambda: STEmbedder("nlpai-lab/KURE-v1"),
    "gemini-embed": lambda: GeminiEmbedder(),
    "maxpass-bm25": lambda: MaxPassage(BM25()),
    "maxpass-bge": lambda: MaxPassage(STEmbedder("BAAI/bge-m3")),
}
