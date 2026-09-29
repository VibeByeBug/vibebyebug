"""약점 기록 — 연습에서 자꾸 놓친 것을 실전 화면에 반영한다.

계획서는 환류를 "다음 발표를 위한 데이터"라고 했지만, 더 짧은 고리가 있다.
발표 전날 모의 디펜스에서 놓친 것을 **당일 실전**에서 먼저 띄우는 것이다.
같은 날 안에서 도니까 효과가 직접적이다.

    모의 디펜스 --(무엇을 몇 번 놓쳤나)--> weak.json --(키워드 순서)--> 실전 화면

LLM 도 임베딩도 안 쓴다. 세는 것과 정렬이 전부다.
"""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_PATH = Path("data/weak.json")

# 놓친 비율이 이 점수만큼 키워드 순위에 더해진다.
# 너무 크면 질문과 무관한 것이 올라오므로, 비슷한 것들 사이의 순서를 바꾸는 정도로 둔다.
BOOST = 2.0


def _key(page: int, fact: str) -> str:
    return f"p{page}|{fact}"


class WeakProfile:
    """어떤 근거를 몇 번 물었고 몇 번 놓쳤는지."""

    def __init__(self, data: dict | None = None):
        d = data or {}
        self.facts: dict[str, dict] = d.get("facts", {})
        self.types: dict[str, dict] = d.get("types", {})
        self.sessions: int = d.get("sessions", 0)

    # ── 기록 (모의 디펜스에서) ──────────────────────────────────────────

    def record(self, page: int, qtype: str, facts: list[str],
               covered: list[str]) -> None:
        for f in facts:
            e = self.facts.setdefault(_key(page, f), {"asked": 0, "missed": 0})
            e["asked"] += 1
            if f not in covered:
                e["missed"] += 1
        t = self.types.setdefault(qtype, {"asked": 0, "covered": 0.0})
        t["asked"] += 1
        t["covered"] += len(covered) / len(facts) if facts else 1.0

    def save(self, path: Path = DEFAULT_PATH) -> None:
        self.sessions += 1
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(
            {"sessions": self.sessions, "facts": self.facts, "types": self.types},
            ensure_ascii=False, indent=1), encoding="utf-8")

    # ── 사용 (실전에서) ────────────────────────────────────────────────

    @classmethod
    def load(cls, path: Path | str | None) -> "WeakProfile":
        if not path:
            return cls()
        p = Path(path)
        if not p.exists():
            return cls()
        try:
            return cls(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            return cls()      # 깨졌으면 없는 셈 친다. 실전에서 멈추면 안 된다.

    def miss_rate(self, page: int, fact: str) -> float:
        e = self.facts.get(_key(page, fact))
        if not e or not e["asked"]:
            return 0.0
        return e["missed"] / e["asked"]

    def boost(self, page: int, fact: str) -> float:
        """자꾸 놓친 근거일수록 키워드 앞으로 당긴다."""
        return BOOST * self.miss_rate(page, fact)

    def weak_type(self, qtype: str, threshold: float = 0.6) -> bool:
        """이 유형에 약한가. 우회 화법을 더 눈에 띄게 할지 판단용."""
        t = self.types.get(qtype)
        if not t or not t["asked"]:
            return False
        return (t["covered"] / t["asked"]) < threshold

    def summary(self) -> list[str]:
        """사람이 읽을 요약. 자주 놓친 것부터."""
        rows = [(v["missed"] / v["asked"], v["missed"], k)
                for k, v in self.facts.items() if v["asked"] and v["missed"]]
        rows.sort(key=lambda x: (-x[0], -x[1]))
        return [f"{k}  {n}/{int(n / r)}회 놓침" for r, n, k in rows[:10]]

    def __bool__(self) -> bool:
        return bool(self.facts)
