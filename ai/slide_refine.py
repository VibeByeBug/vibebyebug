"""슬라이드 글자 정리 - PDF 에서 뽑은 글자를 사람이 읽기 좋은 모양으로 다시 쓴다.

PDF 에서 뽑은 글자는 화면 배치 순서대로 나와서 표와 카드가 흩어진다.
  "B2C 무료 / 0원 / 챌린지 응시와 리더보드 / B2C 프리미엄 / 건별 결제 ..."
리허설 화면과 논리 지도에서 발표자가 슬라이드 내용을 보는데 이 상태로는 읽기 어렵다는 의견이 나왔다.

정리한 글은 보여주기용이다. 검색과 답변 근거는 여전히 원문을 쓴다(원문이 증거다).
모델이 요약하다 숫자나 사실을 바꾸면 안 되므로, 정리본에 원문에 없는 숫자가 있으면 그 슬라이드는 원문을 쓴다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

BATCH = 8          # 한 번에 정리할 슬라이드 수. 많으면 뒤쪽 슬라이드를 빠뜨린다.

PROMPT = """아래는 발표 슬라이드에서 뽑은 글자다. 화면 배치 순서대로 뽑혀서 표와 카드가 흩어져 있다.
슬라이드마다 사람이 읽기 좋게 다시 정리해줘.

지킬 것:
1. 첫 줄은 슬라이드 제목 한 줄. 이어서 내용을 "- " 로 시작하는 목록으로. 묶음이 있으면 "## 묶음 이름" 으로 나눠.
2. 흩어진 짝을 맞춰. 예: "월 고정비" 와 "30만원" 이 따로 있으면 "- 월 고정비: 30만원".
3. 원문에 있는 내용만 쓴다. 새 내용, 해석, 평가를 보태지 마. 요약하느라 사실을 빼지도 마.
4. 숫자, 이름, 용어는 원문 그대로. 반올림, 단위 변환 금지.
5. 페이지 번호, 목차 머리글("READY-Q", "01 제안배경" 같은 반복 머리말)은 빼도 된다.
6. 띄어쓰기가 붙어 있으면 바르게 띄어 써.

출력 형식 (다른 말 붙이지 말고):
=== 슬라이드번호
정리한 내용

{slides}"""


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d+(?:[.,]\d+)*", text)}


def _ok(refined: str, raw: str) -> bool:
    """정리본의 숫자가 전부 원문에 있는가."""
    src = re.sub(r"[\s,]", "", raw)
    return all(n in src for n in _numbers(refined))


def refine(rows: list[dict]) -> dict[int, str]:
    """{슬라이드 번호: 정리한 글}. 정리에 실패한 슬라이드는 빠진다(화면은 원문을 쓴다)."""
    from core_answers import _chat

    raw = {r["page"]: r["text"] for r in rows if r.get("text", "").strip()}
    pages = sorted(raw)
    out: dict[int, str] = {}
    for i in range(0, len(pages), BATCH):
        part = pages[i:i + BATCH]
        blocks = "\n\n".join(f"=== {p}\n{raw[p]}" for p in part)
        text = _chat(PROMPT.format(slides=blocks))
        if not text:
            continue
        for m in re.finditer(r"^===\s*(\d+)\s*\n(.*?)(?=^===\s*\d+\s*$|\Z)", text, re.S | re.M):
            p, body = int(m.group(1)), m.group(2).strip()
            if p in raw and body and _ok(body, raw[p]):
                out[p] = body
    return out


def load(path: Path | str) -> dict[int, str] | None:
    path = Path(path)
    if not path.exists():
        return None
    try:
        return {int(k): v for k, v in json.loads(path.read_text(encoding="utf-8")).items()}
    except Exception:
        return None


def save(refined: dict[int, str], path: Path | str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({str(k): v for k, v in refined.items()}, ensure_ascii=False, indent=1),
                    encoding="utf-8")
