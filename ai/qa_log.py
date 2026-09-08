"""실전 질의응답 기록 — 사후 리포트의 재료.

계획서 [사후] 단계는 실전 로그가 있어야 만들 수 있는데, 정작 로그를 남기는 코드가
없었다. 질문이 들어오면 처리하고 버렸다. 그러면 영원히 안 쌓인다.

한 줄에 한 질문씩 JSONL 로 붙인다. 나중에 이런 것들이 이 파일 하나로 답이 난다.

  질문이 실제로 얼마나 긴가        -> 요약 기능이 필요한지
  no_evidence 가 얼마나 자주 뜨나  -> 문턱값이 맞는지
  예상 질문 적중률                 -> 계획서의 사후 리포트 핵심
  지연이 실제로 얼마인가           -> 프리셋 확정

기록이 실패해도 발표는 계속돼야 한다. 여기서 예외가 나가면 안 된다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

DEFAULT_PATH = Path("data/qa_log.jsonl")


def append(cue, question: str, path: Path | str = DEFAULT_PATH,
           session: str = "", expected: list[dict] | None = None) -> None:
    """질문 하나를 기록한다. 실패해도 조용히 넘어간다.

    expected 를 주면 예상 질문과 맞았는지도 같이 남긴다(적중률 계산용).
    """
    try:
        row = {
            "at": datetime.now().isoformat(timespec="seconds"),
            "session": session,
            "question": question,
            "q_chars": len(question or ""),
            "qtype": cue.question_type,
            "status": cue.status,
            "latency_ms": cue.latency_ms,
            "slides": [s.slide for s in cue.sources],
            "keywords": cue.keywords,
            "weak_type": cue.weak_type,
        }
        if expected is not None:
            row["expected_hit"] = _hit(question, cue, expected)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with Path(path).open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass          # 기록 실패로 발표를 멈추지 않는다


def _norm(s: str) -> set:
    return {w for w in re.findall(r"[가-힣]{2,}|[A-Za-z]{2,}|\d[\d,.]*", s or "")}


def _hit(question: str, cue, expected: list[dict]) -> dict | None:
    """실제 질문이 모의 디펜스에서 다룬 대목인가.

    '적중'을 문장 유사도로 보면 안 된다. 예상 질문은 길고 문어체인데 실제 질문은
    짧고 구어체라 낱말이 겹칠 수가 없다. 실측 결과 같은 주제인 질문쌍도 0.06~0.13
    밖에 안 나왔다.

    발표자에게 의미 있는 건 "우리가 연습한 대목에서 질문이 나왔나"다.
    그래서 **근거 슬라이드가 같은지**를 주 신호로 쓴다. 문장 겹침은 보조로만 본다.
    겹침은 자카드 대신 짧은 쪽으로 나눈다(길이 차가 커서).
    """
    qw = _norm(question)
    if not qw or not cue.sources:
        return None

    top_slide = cue.sources[0].slide
    slides = {e.get("gold_page") for e in expected}
    same_slide = top_slide in slides

    best, best_score = None, 0.0
    for e in expected:
        ew = _norm(e.get("question", ""))
        if not ew:
            continue
        score = len(qw & ew) / min(len(qw), len(ew))    # 짧은 쪽 기준
        if score > best_score:
            best, best_score = e, score

    return {
        "matched": same_slide,                # 연습한 대목에서 나왔는가
        "same_slide": same_slide,
        "slide": top_slide,
        "text_overlap": round(best_score, 3),
        "closest_expected": (best or {}).get("question", "")[:60],
    }


# ── 읽기 (사후 리포트에서) ────────────────────────────────────────────

@dataclass
class LogStats:
    total: int
    by_status: dict
    by_qtype: dict
    q_chars: list
    latencies: list
    hits: int
    hit_judged: int

    def pct(self, n: int) -> str:
        return f"{100 * n / self.total:.0f}%" if self.total else "-"


def load(path: Path | str = DEFAULT_PATH) -> list[dict]:
    p = Path(path)
    if not p.exists():
        return []
    rows = []
    for line in p.open(encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            continue          # 깨진 줄은 건너뛴다
    return rows


def stats(rows: list[dict]) -> LogStats:
    from collections import Counter
    hits = sum(1 for r in rows
               if isinstance(r.get("expected_hit"), dict) and r["expected_hit"].get("matched"))
    judged = sum(1 for r in rows if isinstance(r.get("expected_hit"), dict))
    return LogStats(
        total=len(rows),
        by_status=dict(Counter(r.get("status", "?") for r in rows)),
        by_qtype=dict(Counter(r.get("qtype", "") for r in rows if r.get("qtype"))),
        q_chars=sorted(r.get("q_chars", 0) for r in rows),
        latencies=sorted(r.get("latency_ms", 0) for r in rows if r.get("status") == "ok"),
        hits=hits,
        hit_judged=judged,
    )
