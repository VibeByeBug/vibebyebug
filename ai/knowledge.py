"""통합 지식 조각 - 슬라이드, 대본, 설명 자료, 리허설을 한 색인에 넣는다.

전에는 모든 지식이 슬라이드에 매달려 있었다. 검색 단위가 슬라이드 한 장이고, 발표자 설명은
어느 슬라이드에 붙거나 "전체" 로 밀렸다. 그래서 세 가지가 막혔다.
  - 슬라이드에 없는 주제(검색기를 고른 이유 등)는 붙일 곳이 없어 검색에서 약했다
  - 설명을 문장 하나씩 저장해서 "두 방식을 합쳐야 88.9%" 처럼 앞 문장이 없으면 뜻이 끊겼다
  - 슬라이드 한 장이 통째로 한 단위라, 긴 슬라이드의 한 줄에 있는 답이 묻혔다

여기서는 출처와 상관없이 "지식 조각" 을 단위로 쓴다.
  슬라이드   AI 정리본의 묶음(## 제목) 하나가 조각 하나. 정리본이 없으면 원문 몇 줄씩
  보강 자료  원래 글의 한 문단을 소제목과 함께 한 조각으로 (리허설처럼 문단이 없으면 이어진 문장 2개씩)
조각마다 출처(슬라이드 번호, 자료 종류)가 붙는다. 답변 근거는 여전히 원문 문장이다.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter

PARA_MAX = 5          # 한 문단이 이 문장 수를 넘으면 나눈다
NOTE_WINDOW = 3       # 긴 문단을 나눌 때 조각 하나의 문장 수
NOTE_STRIDE = 2       # 한 문장씩 겹치게 넘어간다 (경계에 걸린 문장도 앞뒤 맥락을 갖게)
SLIDE_LINES = 6       # 정리본이 없을 때 원문을 몇 줄씩 묶을지
SECTION_MAX = 420     # 정리본 묶음이 이보다 길면 나눈다

KIND_LABEL = {"slide": "슬라이드", "script": "발표 대본", "doc": "설명 자료", "rehearsal": "리허설"}


def _title(text: str) -> str:
    return next((l.strip().lstrip("-# ").strip() for l in text.split("\n") if l.strip()), "")


def _slide_chunks(page: int, raw: str, refined: str | None) -> list[dict]:
    out = []
    if refined:
        title = _title(refined)
        # "## 묶음" 단위로 나눈다. 제목 줄과 첫 묶음 앞의 줄은 머리 조각이 된다.
        parts = re.split(r"\n(?=##\s)", refined.strip())
        for part in parts:
            lines = [l for l in part.split("\n") if l.strip()]
            if not lines:
                continue
            head = lines[0].lstrip("# ").strip() if lines[0].startswith("#") else ""
            body = lines[1:] if head else lines
            # 긴 묶음은 줄 단위로 잘라 여러 조각으로
            buf: list[str] = []
            for l in body:
                buf.append(l.lstrip("- ").strip())
                if sum(len(x) for x in buf) > SECTION_MAX:
                    out.append((head, buf))
                    buf = []
            if buf or head:
                out.append((head, buf))
        chunks = []
        for head, body in out:
            body = [l for l in body if l != title]          # 첫 묶음에 제목 줄이 다시 들어 있다
            if not head and not body:
                continue
            chunks.append({"kind": "slide", "page": page,
                           "text": " / ".join(x for x in [title if title != head else "", head, *body] if x)})
        return chunks
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    title = lines[0] if lines else ""
    return [{"kind": "slide", "page": page, "text": " / ".join(([title] if i else []) + lines[i:i + SLIDE_LINES])}
            for i in range(0, len(lines), SLIDE_LINES)]


def _note_chunks(notes: list[dict]) -> list[dict]:
    """보강 자료 문장을 조각으로 묶는다. 저장 순서가 곧 원래 글의 순서다.

    문단 정보(para, section)가 있으면 같은 문단의 문장을 소제목과 함께 한 조각으로 묶는다.
    처음엔 이어진 문장 3개씩 묶었는데, 소제목 경계를 넘나들며 두 주제가 섞였고
    주제어가 소제목에만 있는 문장("46%에서 55%로")을 못 찾았다(59위).
    문단 정보가 없는 리허설 녹음은 이어진 문장 2개씩 겹쳐 묶는다.
    """
    groups: dict[tuple, list[dict]] = {}
    for n in notes:
        # 슬라이드 반복(repeat)도 넣는다. 분류가 틀려 슬라이드에 없는 설명이 repeat 로 잡히는 경우가 있었고
        # ("이미지 슬라이드는 20자 미만일 때 이미지로 읽는다"), 빼면 그 지식이 통째로 사라졌다.
        # 정말 슬라이드와 같은 말이면 같은 내용이 두 번 들어갈 뿐이다.
        if n.get("kind") not in ("explain", "fact", "repeat"):
            continue
        para = n.get("para")
        key = (n.get("source", "doc"), n.get("created", ""), para if para is not None else -1)
        groups.setdefault(key, []).append(n)
    out = []
    for (source, _, para), ns in groups.items():
        if para is not None and para >= 0:
            section = ns[0].get("section") or ""
            if len(ns) <= PARA_MAX:
                spans = [ns]
            else:
                spans = [ns[s:s + NOTE_WINDOW] for s in range(0, len(ns) - 1, NOTE_STRIDE)]
        else:
            section = ""
            spans = [ns[s:s + 2] for s in range(0, max(len(ns) - 1, 1))]
        for span in spans:
            pages = [n.get("page") for n in span if n.get("page")]
            page = Counter(pages).most_common(1)[0][0] if pages else None
            body = " ".join(n["text"] for n in span)
            out.append({"kind": source if source in KIND_LABEL else "doc", "page": page,
                        "text": f"{section} / {body}" if section else body})
    return out


def build(rows: list[dict], notes: list[dict] | None = None,
          refined: dict[int, str] | None = None) -> list[dict]:
    """지식 조각 목록. [{"id", "kind", "page", "text"}]  id 는 내용에서 만든 고정 번호"""
    refined = refined or {}
    chunks = []
    for r in rows:
        chunks += _slide_chunks(r["page"], r["text"], refined.get(r["page"]))
    chunks += _note_chunks(notes or [])
    # 번호는 내용으로 정한다. 설명을 더하거나 지워도 나머지 조각의 번호가 그대로라
    # 지식 지도(knowledge_graph.py)를 통째로 다시 만들지 않아도 된다.
    seen = set()
    out = []
    for c in chunks:
        cid = hashlib.sha1(f"{c['kind']}|{c['page']}|{c['text']}".encode("utf-8")).hexdigest()[:10]
        if cid in seen:
            continue
        seen.add(cid)
        c["id"] = cid
        out.append(c)
    return out


def to_context(chunks: list[dict]) -> list[tuple[int, str]]:
    """검색한 조각을 답변 모델에 넘길 자료로. 슬라이드 번호별로 묶고, 슬라이드가 없는 조각은 0번(보강 자료)."""
    by_page: dict[int, list[str]] = {}
    for c in chunks:
        p = c["page"] or 0
        if c["kind"] == "slide":
            line = c["text"]
        elif p:
            line = f"[발표자 설명] {c['text']}"
        else:
            line = f"[{KIND_LABEL.get(c['kind'], '설명 자료')}] {c['text']}"
        if line not in by_page.setdefault(p, []):
            by_page[p].append(line)
    return [(p, "\n".join(lines)) for p, lines in by_page.items()]
