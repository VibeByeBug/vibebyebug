"""발표자 설명 모으기 - 리허설 녹음, 발표 대본, 프로젝트 설명 자료.

슬라이드에는 요약만 적혀 있어서 "왜", "어떻게" 를 묻는 질문에 답이 얕았다.
발표자가 말로 풀어 설명한 내용이나 대본, 기획서에는 슬라이드에 없는 이유, 예시, 맥락이 있다.

들어온 글을 문장으로 나눠 네 가지로 분류한다.
  repeat    슬라이드에 이미 있는 말     답변 근거로는 안 쓴다. 검색용 표현으로만 둔다
                                          (청중은 슬라이드 문구가 아니라 말하듯이 묻는다)
  explain   슬라이드에 없는 이유, 예시, 맥락   저장
  fact      슬라이드에 없는 새 사실이나 숫자   발표자 확인을 받고 저장
  filler    군말                             버림

이미 저장된 설명과 겹치는 문장도 뺀다. 리허설을 여러 번 해도 같은 말이 쌓이지 않게.
모델을 부르는 건 정리 단계뿐이고, 저장은 발표자가 확인한 것만 한다.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

KINDS = ("repeat", "explain", "fact", "filler", "known")
SOURCES = ("rehearsal", "script", "doc")
SOURCE_LABEL = {"rehearsal": "리허설", "script": "발표 대본", "doc": "설명 자료"}
MAX_CHUNK = 3500      # 긴 자료는 이 길이로 나눠 여러 번 정리한다
DUP_SIM = 0.6         # 글자 2-gram 겹침이 이 이상이면 같은 설명으로 본다

PROMPT = """발표자가 준비한 {source_label}을 정리해줘. 이걸로 발표 뒤 질의응답에서 쓸 설명 자료를 만든다.

할 일:
1. 글을 뜻이 하나인 문장으로 나눠. 말투의 군말("어", "그니까", "뭐냐면")은 빼고, 음성 인식이 잘못 받아 적은 말은
   슬라이드에 나온 용어로 고쳐. 내용은 바꾸지 마.
2. 문장마다 종류를 골라.
   repeat  = 슬라이드에 이미 적힌 내용을 다시 말한 것
   explain = 슬라이드에 없는 이유, 예시, 맥락, 배경 설명
   fact    = 슬라이드에 없는 새 사실이나 숫자
   filler  = 인사, 넘어가는 말처럼 정보가 없는 것
   known   = 아래 "이미 저장된 설명" 과 표현만 다르고 뜻이 같은 것
3. 문장마다 어느 슬라이드에 대한 설명인지 번호를 붙여. 특정 슬라이드가 아니면 0.
4. 발표자가 말한 것만 옮겨. 네가 새 내용을 보태지 마.
{page_hint}
출력 형식 (다른 말 붙이지 말고 한 줄에 한 문장):
슬라이드번호 | 종류 | 문장

--- 슬라이드 ---
{slides}
{known_block}
--- {source_label} ---
{text}"""


def _bigrams(s: str) -> set:
    s = re.sub(r"\s+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _similar(a: str, b: str) -> float:
    x, y = _bigrams(a), _bigrams(b)
    return len(x & y) / min(len(x), len(y)) if x and y else 0.0


def _numbers(text: str) -> list[str]:
    return [n.replace(",", "") for n in re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*", text)]


def _chunks(text: str) -> list[str]:
    """긴 자료를 문단 경계로 나눈다."""
    out, cur = [], ""
    for para in re.split(r"\n\s*\n", text):
        if len(cur) + len(para) > MAX_CHUNK and cur:
            out.append(cur)
            cur = ""
        cur += para + "\n\n"
    if cur.strip():
        out.append(cur)
    return out


def classify(rows: list[dict], text: str, source: str, page: int | None = None,
             existing: list[dict] | None = None) -> list[dict]:
    """글을 문장으로 나눠 분류한다. 저장하지 않는다(발표자 확인용).

    반환: [{"page", "kind", "text", "dup", "new_numbers"}]
      dup          이미 저장된 설명과 겹치는가 (겹치면 기본으로 저장하지 않는다)
      new_numbers  슬라이드에 없는 숫자 (있으면 fact 로 올려서 확인을 받는다)
    """
    from core_answers import _chat

    text = (text or "").strip()
    if not text:
        return []
    by_page = {r["page"]: r["text"] for r in rows}
    deck = re.sub(r"[\s,]", "", "\n".join(by_page.values()))
    slides = "\n\n".join(f"[{p}번 슬라이드]\n{t}" for p, t in sorted(by_page.items()))
    hint = (f"5. 이 녹음은 발표자가 {page}번 슬라이드를 설명한 것이다. 특별한 이유가 없으면 {page}번으로 붙여.\n"
            if page else "")
    existing = existing or []

    items: list[dict] = []
    for part in _chunks(text):
        known = [e for e in existing if e.get("kind") in ("explain", "fact")
                 and (page is None or e.get("page") in (page, None))][:40]
        known_block = ("\n--- 이미 저장된 설명 ---\n" + "\n".join(f"- {e['text']}" for e in known) + "\n"
                       if known else "")
        raw = _chat(PROMPT.format(source_label=SOURCE_LABEL.get(source, "자료"), page_hint=hint,
                                  slides=slides, text=part, known_block=known_block))
        if raw is None:
            raise RuntimeError("AI 호출에 실패했습니다. 잠시 뒤 다시 시도해주세요.")
        for line in raw.splitlines():
            parts = [x.strip().strip("\"'") for x in line.strip().split("|")]
            if len(parts) < 3 or not parts[2]:
                continue
            m = re.search(r"\d+", parts[0])
            p = int(m.group()) if m else 0
            p = p if p in by_page else (page or None)
            kind = parts[1] if parts[1] in KINDS else "explain"
            sent = parts[2]
            new_numbers = [n for n in _numbers(sent) if n not in deck]
            # 슬라이드에 없는 숫자가 있으면 설명이 아니라 새 사실이다. 확인을 받아야 한다.
            if kind in ("explain", "repeat") and new_numbers:
                kind = "fact"
            # 글자가 많이 겹치거나, 모델이 이미 저장된 설명과 같은 뜻이라고 본 것은 중복이다
            dup = kind == "known" or any(_similar(sent, e["text"]) >= DUP_SIM for e in existing)
            if kind == "known":
                kind = "explain"
            items.append({"page": p, "kind": kind, "text": sent, "dup": dup, "new_numbers": new_numbers})
    return items


class NoteStore:
    """발표 하나의 발표자 설명. data/notes/{id}.json"""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.notes: list[dict] = []
        if self.path.exists():
            try:
                self.notes = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                self.notes = []

    def add(self, items: list[dict], source: str) -> list[dict]:
        """확인된 문장을 저장한다. 겹치는 설명은 더 긴 쪽 하나만 남긴다."""
        added = []
        for it in items:
            kind = it.get("kind")
            text = str(it.get("text", "")).strip()
            if kind not in ("repeat", "explain", "fact") or not text:
                continue
            same = next((n for n in self.notes if _similar(text, n["text"]) >= DUP_SIM), None)
            if same:
                if len(text) > len(same["text"]):    # 더 자세한 설명이면 바꾼다
                    same.update(text=text, updated=datetime.now().isoformat(timespec="seconds"))
                continue
            note = {"id": uuid.uuid4().hex[:8], "page": it.get("page"), "kind": kind, "text": text,
                    "source": source if source in SOURCES else "doc",
                    "created": datetime.now().isoformat(timespec="seconds")}
            self.notes.append(note)
            added.append(note)
        self._save()
        return added

    def delete(self, note_id: str) -> None:
        self.notes = [n for n in self.notes if n["id"] != note_id]
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.notes, ensure_ascii=False, indent=1), encoding="utf-8")


def for_page(notes: list[dict], page: int, answer_only: bool = True) -> list[dict]:
    """슬라이드 하나에 붙은 설명. answer_only 면 답변 근거로 쓸 것(explain, fact)만."""
    kinds = ("explain", "fact") if answer_only else ("repeat", "explain", "fact")
    return [n for n in notes if n.get("page") == page and n.get("kind") in kinds]


def general(notes: list[dict]) -> list[dict]:
    """특정 슬라이드가 아닌 설명 (프로젝트 전반)."""
    return [n for n in notes if not n.get("page") and n.get("kind") in ("explain", "fact")]
