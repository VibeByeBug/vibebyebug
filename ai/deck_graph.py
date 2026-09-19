"""발표자료 논리 지도 - 슬라이드 사이의 주장과 근거를 잇는다 (GraphRAG 식).

검색은 질문과 비슷한 슬라이드 3장을 찾을 뿐이라, "왜 이 방법이 맞나요?" 처럼
문제(3번), 방법(8번), 검증(10번)이 흩어진 질문은 반쪽 답이 됐다.
10번의 "1.47배" 가 9번의 어떤 주장을 뒷받침하는지 같은 관계를 몰랐기 때문이다.

업로드 뒤 준비 단계에서 모델이 자료 전체를 한 번 읽고 세 가지를 만든다.
  역할   슬라이드마다 문제 / 방법 / 결과 / 근거 / 한계 / 제안 / 소개
  연결   "9번 주장은 10번이 뒷받침한다" 같은 슬라이드 사이 관계
  줄거리 발표 전체 흐름 5~6줄

실전에서는 검색한 슬라이드에 연결된 슬라이드를 붙여서 흐름도와 추천 답변에 넘긴다.
논리 지도는 AI 가 만든 추론이라 "어떤 슬라이드를 같이 볼지" 고르는 데만 쓴다.
답의 근거는 여전히 슬라이드 원문이고 숫자 검사도 그대로 한다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROLES = ("소개", "문제", "방법", "결과", "근거", "한계", "제안")
RELATIONS = ("근거", "원인", "방법", "결과", "예시", "한계", "이어짐")

PROMPT = """아래는 발표 슬라이드 전체다. 발표의 논리 구조를 정리해줘.

1. 슬라이드마다 역할을 하나 골라: {roles}
   그리고 그 슬라이드의 핵심을 15자 이내 제목으로. 띄어쓰기는 지켜.
2. 슬라이드 사이 논리 연결을 찾아. 출발은 주장이나 질문이 나오는 슬라이드, 도착은 그걸 뒷받침하거나 답하는 슬라이드.
   예: "3번의 문제 제기를 10번의 검증 결과가 뒷받침한다", "12번의 가격을 13번의 경쟁사 비교가 뒷받침한다".
   발표 순서대로 바로 다음 슬라이드만 잇지 마. 청중이 "왜?", "근거는?" 하고 물었을 때 함께 봐야 할
   슬라이드끼리 이어라. 멀리 떨어진 슬라이드 사이의 연결이 더 중요하다.
   관계 종류는 이 중 하나: {relations}
   관계마다 왜 이어지는지 20자 이내로, 띄어쓰기를 지켜서. 슬라이드에 없는 숫자는 쓰지 마.
   표지, 목차, 감사 슬라이드는 연결하지 마. 연결은 10~15개.
3. 발표 전체 줄거리를 5~6줄로. 한 줄에 한 단계, 각 줄 끝에 근거 슬라이드 번호.

출력 형식 (다른 말 붙이지 말고 이것만):
## 슬라이드
번호 | 역할 | 제목
## 연결
출발번호 | 도착번호 | 관계 | 이유
## 줄거리
문장 | 슬라이드번호들(쉼표)

--- 슬라이드 ---
{slides}"""


def _numbers_ok(text: str, source: str) -> bool:
    src = re.sub(r"[\s,]", "", source)
    return all(n.replace(",", "") in src for n in re.findall(r"\d+(?:[.,]\d+)*", text))


def build(rows: list[dict], notes: list[dict] | None = None) -> dict:
    """논리 지도를 만든다. 실패하면 빈 지도를 돌려준다(없어도 검색은 지금처럼 동작한다).

    notes 는 발표자 설명(리허설, 대본, 설명 자료). 슬라이드에 없는 이유와 맥락이 들어 있어서
    같이 읽히면 슬라이드 사이 연결을 더 정확히 찾는다.
    """
    from core_answers import _chat
    import notes as notes_mod

    notes = notes or []
    by_page = {r["page"]: r["text"] for r in rows}
    blocks = []
    for p, t in sorted(by_page.items()):
        extra = notes_mod.for_page(notes, p)
        blocks.append(f"[{p}번 슬라이드]\n{t}" + "".join(f"\n[발표자 설명] {n['text']}" for n in extra))
    general = notes_mod.general(notes)
    if general:
        blocks.append("[프로젝트 전반 설명]\n" + "\n".join(n["text"] for n in general))
    raw = _chat(PROMPT.format(roles=", ".join(ROLES), relations=", ".join(RELATIONS), slides="\n\n".join(blocks)))
    graph = {"nodes": [], "edges": [], "story": [], "ok": raw is not None, "notes_used": len(notes)}
    if not raw:
        return graph

    # 숫자 검사 기준에 발표자 설명도 넣는다 (설명에서 나온 숫자는 틀린 게 아니다)
    deck = "\n".join(by_page.values()) + "\n" + "\n".join(n["text"] for n in notes)
    section = ""
    seen_nodes = set()
    for line in raw.splitlines():
        line = line.strip().strip("*")
        head = re.match(r"^#+\s*(\S+)", line)
        if head:
            section = head.group(1)
            continue
        parts = [x.strip().strip("\"'") for x in line.split("|")]
        if section.startswith("슬라이드") and len(parts) >= 3:
            m = re.search(r"\d+", parts[0])
            if not m or int(m.group()) not in by_page or int(m.group()) in seen_nodes:
                continue
            page = int(m.group())
            role = parts[1] if parts[1] in ROLES else "소개"
            graph["nodes"].append({"page": page, "role": role, "title": parts[2][:24]})
            seen_nodes.add(page)
        elif section.startswith("연결") and len(parts) >= 3:
            a, b = re.search(r"\d+", parts[0]), re.search(r"\d+", parts[1])
            if not a or not b:
                continue
            src, dst = int(a.group()), int(b.group())
            if src == dst or src not in by_page or dst not in by_page:
                continue
            rel = parts[2] if parts[2] in RELATIONS else "이어짐"
            why = parts[3][:30] if len(parts) > 3 else ""
            if why and not _numbers_ok(why, deck):
                why = ""
            graph["edges"].append({"from": src, "to": dst, "relation": rel, "why": why})
        elif section.startswith("줄거리") and len(parts) >= 1 and parts[0]:
            pages = [int(x) for x in re.findall(r"\d+", parts[1])] if len(parts) > 1 else []
            pages = [p for p in pages if p in by_page]
            text = re.sub(r"^\d+[.)]\s*", "", parts[0])
            if _numbers_ok(text, deck):
                graph["story"].append({"text": text[:60], "pages": pages})
    # 역할을 못 받은 슬라이드도 점으로는 그린다
    for p in sorted(by_page):
        if p not in seen_nodes:
            first = next((l for l in by_page[p].split("\n") if l.strip()), "")
            graph["nodes"].append({"page": p, "role": "소개", "title": first[:24]})
    graph["nodes"].sort(key=lambda n: n["page"])
    graph["edges"] = graph["edges"][:20]
    return graph


def neighbors(graph: dict | None, pages: list[int], limit: int = 3) -> list[int]:
    """검색으로 찾은 슬라이드에 논리적으로 연결된 슬라이드. 먼저 찾은 슬라이드의 연결부터."""
    if not graph:
        return []
    out: list[int] = []
    for p in pages:
        for e in graph.get("edges", []):
            other = e["to"] if e["from"] == p else e["from"] if e["to"] == p else None
            if other is not None and other not in pages and other not in out:
                out.append(other)
    return out[:limit]


def story_text(graph: dict | None) -> str:
    if not graph or not graph.get("story"):
        return ""
    return "\n".join(f"- {s['text']} (슬라이드 {', '.join(map(str, s['pages']))})" for s in graph["story"])


def load(path: Path | str) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save(graph: dict, path: Path | str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")
