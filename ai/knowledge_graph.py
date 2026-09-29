"""지식 지도 (화면 이름도 "지식 지도") - 지식 조각(knowledge.py) 사이의 관계.

슬라이드 사이의 관계는 "슬라이드 지도"(deck_graph.py)다. 둘은 점의 단위가 다르다.

슬라이드 슬라이드 지도(deck_graph.py)는 슬라이드끼리만 이었다. 대본이나 설명 자료에만 있는
"왜 이렇게 했나" 는 지도에 들어갈 자리가 없었다. 여기서는 출처와 상관없이 지식 조각을 잇는다.

  조각마다   짧은 이름(무엇에 대한 내용인지)과 주제 묶음
  관계       근거, 원인, 결과, 방법, 예시, 한계, 같은내용

실전에서 쓰는 곳 (pipeline._kb_context):
  - 검색이 찾은 조각의 이웃 중 질문과 맞는 것을 근거에 더한다
    ("1초 목표를 지키려고 뭘 했나요" 는 목표, 검색기 선택, 2단계 폐기가 서로 다른 자료에 있다)
  - 같은내용 으로 이어진 조각은 하나만 넘긴다 (슬라이드와 설명 자료가 같은 말을 할 때)

모델은 준비 단계에서 한 번 부른다. 조각 100개 기준 30초 안팎.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

RELATIONS = ("근거", "원인", "결과", "방법", "예시", "한계", "같은내용")
BATCH = 80            # 한 번에 넘길 조각 수. 많으면 뒤쪽 조각의 관계를 빠뜨린다
MAX_LINKS = 4         # 조각 하나에 붙일 관계 수 (많으면 이웃이 질문과 상관없이 늘어난다)

PROMPT = """아래는 한 발표의 지식 조각이다. 슬라이드, 발표 대본, 설명 자료, 리허설에서 모았다.
이 조각들로 지식 지도를 만들어줘.

할 일:
1. 조각마다 무엇에 대한 내용인지 짧은 이름(15자 이내, 띄어쓰기 지켜서)과 주제 묶음을 붙여.
   주제 묶음은 발표 전체에서 6~10개로 맞춰.{topics_hint}
2. 조각 사이의 관계를 이어. 관계 종류: {relations}
   - 근거: 앞 조각이 뒤 조각의 주장을 받친다
   - 원인, 결과: 앞 조각 때문에 뒤 조각이 생겼다 / 앞 조각을 해서 뒤 조각이 나왔다
   - 방법: 앞 조각의 목표나 문제를 뒤 조각의 방법으로 푼다
   - 예시, 한계: 뒤 조각이 앞 조각의 예시다 / 뒤 조각이 앞 조각의 한계다
   - 같은내용: 출처만 다르고 같은 내용을 말한다
3. 출처가 다른 조각 사이(슬라이드와 설명 자료 등)의 관계를 특히 찾아. 같은 슬라이드 안 조각끼리의 뻔한 연결은 빼.
4. 모든 조각이 관계를 1개 이상 갖게 해. 조각 하나에 관계는 {max_links}개까지. 조각에 적힌 내용으로 확인되는 관계만.
5. 발표 전체를 소개하는 조각(서비스 소개 등) 하나에 관계를 몰지 마. 가장 구체적으로 이어지는 조각끼리 이어.

출력 형식 (다른 말 붙이지 말고):
조각 | 번호 | 이름 | 주제
관계 | 출발번호 | 도착번호 | 관계 | 이유(15자 이내)

--- 지식 조각 ---
{chunks}"""


def _label(c: dict) -> str:
    kind = {"slide": "슬라이드", "script": "대본", "doc": "설명 자료", "rehearsal": "리허설"}.get(c["kind"], "자료")
    return f"{kind} p.{c['page']}" if c.get("page") else kind


def build(chunks: list[dict]) -> dict:
    """{"ok", "nodes": {id: {"name", "topic"}}, "edges": [{"from", "to", "relation", "why"}], "topics": [...]}"""
    from core_answers import _chat

    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    topics: list[str] = []
    for start in range(0, len(chunks), BATCH):
        part = chunks[start:start + BATCH]
        block = "\n".join(f"[{i + 1}] ({_label(c)}) {c['text'][:300]}" for i, c in enumerate(part))
        hint = f"\n   이미 정한 주제 묶음이 있으면 되도록 그 이름을 써: {', '.join(topics)}" if topics else ""
        raw = _chat(PROMPT.format(relations=", ".join(RELATIONS), max_links=MAX_LINKS,
                                  topics_hint=hint, chunks=block))
        if not raw:
            continue
        for line in raw.splitlines():
            parts = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(parts) >= 4 and parts[0] == "조각":
                i = _num(parts[1])
                if i and 1 <= i <= len(part):
                    topic = parts[3][:20]
                    nodes[part[i - 1]["id"]] = {"name": parts[2][:24], "topic": topic}
                    if topic and topic not in topics:
                        topics.append(topic)
            elif len(parts) >= 4 and parts[0] == "관계":
                a, b = _num(parts[1]), _num(parts[2])
                rel = parts[3] if parts[3] in RELATIONS else None
                if a and b and a != b and rel and 1 <= a <= len(part) and 1 <= b <= len(part):
                    edges.append({"from": part[a - 1]["id"], "to": part[b - 1]["id"], "relation": rel,
                                  "why": (parts[4] if len(parts) > 4 else "")[:30]})
    # 조각마다 관계 수를 제한한다 (모델이 지키지 않을 때가 있다)
    count: dict[str, int] = {}
    kept = []
    for e in edges:
        if count.get(e["from"], 0) >= MAX_LINKS or count.get(e["to"], 0) >= MAX_LINKS * 2:
            continue
        count[e["from"]] = count.get(e["from"], 0) + 1
        count[e["to"]] = count.get(e["to"], 0) + 1
        kept.append(e)
    return {"ok": bool(nodes), "nodes": nodes, "edges": kept, "topics": topics,
            "chunk_ids": [c["id"] for c in chunks]}


def _num(s: str) -> int | None:
    m = re.search(r"\d+", s)
    return int(m.group()) if m else None


def neighbors(graph: dict, ids: list[str]) -> list[tuple[str, str]]:
    """조각들과 관계로 이어진 조각 [(id, 관계)]. 같은내용은 빼고 (중복일 뿐이다)."""
    want = set(ids)
    out = []
    for e in graph.get("edges", []):
        if e["relation"] == "같은내용":
            continue
        if e["from"] in want and e["to"] not in want:
            out.append((e["to"], e["relation"]))
        elif e["to"] in want and e["from"] not in want:
            out.append((e["from"], e["relation"]))
    seen, uniq = set(), []
    for i, r in out:
        if i not in seen:
            seen.add(i)
            uniq.append((i, r))
    return uniq


def same_pairs(graph: dict) -> set[tuple[str, str]]:
    """같은내용 관계로 이어진 조각 쌍 (양방향)."""
    out = set()
    for e in graph.get("edges", []):
        if e["relation"] == "같은내용":
            out.add((e["from"], e["to"]))
            out.add((e["to"], e["from"]))
    return out


def coverage(graph: dict, chunk_ids: list[str]) -> float:
    """지금 조각 중 그래프에 들어 있는 비율. 설명이 많이 늘었으면 다시 만들 때다."""
    if not chunk_ids:
        return 1.0
    have = set(graph.get("nodes", {}))
    return sum(1 for c in chunk_ids if c in have) / len(chunk_ids)


def load(path: Path | str) -> dict | None:
    path = Path(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def save(graph: dict, path: Path | str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")
