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


REGISTRY = {
    "bm25": lambda: BM25(),
    "bge-m3": lambda: STEmbedder("BAAI/bge-m3"),
    "kure-v1": lambda: STEmbedder("nlpai-lab/KURE-v1"),
    "gemini-embed": lambda: GeminiEmbedder(),
}
