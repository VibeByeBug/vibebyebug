"""Q&A 기록 조회.

기록은 ReadyQ 가 질문마다 직접 남긴다(ai/qa_log.py -> data/qa_log.jsonl).
백엔드에서 또 저장하면 같은 질문이 두 군데 쌓이고, 사후 리포트(ai/report.py)가
읽는 파일과 프론트가 보는 목록이 어긋난다. 그래서 여기서는 저장하지 않고
AI 가 남긴 기록을 읽어서 돌려주기만 한다.

AI 로그가 담는 것이 더 많다 - 질문 유형, 근거 슬라이드, 판정 상태(ok/ignored/
no_evidence), 지연시간, 예상 질문 적중 여부까지 들어있어 회고 리포트의 재료가 된다.
"""

from fastapi import APIRouter

import ai_engine  # noqa: F401  — ai/ 를 import 경로에 등록
import qa_log

router = APIRouter(
    prefix="/api/logs",
    tags=["Q&A Logs"]
)


@router.get("/{presentation_id}")
async def get_presentation_logs(presentation_id: str):
    """특정 발표의 Q&A 기록. 프론트의 '이전 질문 목록' 화면이 쓴다."""
    rows = [r for r in qa_log.load() if r.get("session") == presentation_id]

    return {
        "status": "success",
        "presentation_id": presentation_id,
        "count": len(rows),
        "logs": rows,
    }


@router.get("/{presentation_id}/summary")
async def get_presentation_summary(presentation_id: str):
    """회고 리포트용 집계. 총 질문 수·유형 분포·평균 지연·적중률."""
    rows = [r for r in qa_log.load() if r.get("session") == presentation_id]
    if not rows:
        return {"status": "success", "presentation_id": presentation_id,
                "total": 0, "message": "아직 발표 기록이 없어요"}

    answered = [r for r in rows if r.get("status") == "ok"]
    lat = [r["latency_ms"] for r in answered if r.get("latency_ms") is not None]
    hits = [r for r in rows if r.get("expected_hit")]

    by_type = {}
    for r in rows:
        t = r.get("qtype") or "미분류"
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "status": "success",
        "presentation_id": presentation_id,
        "total": len(rows),                                   # 총 질문 수
        "answered": len(answered),                            # 근거를 찾은 질문
        "no_evidence": sum(1 for r in rows if r.get("status") == "no_evidence"),
        "ignored": sum(1 for r in rows if r.get("status") == "ignored"),
        "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else None,
        "expected_hit_rate": round(100 * len(hits) / len(rows), 1) if rows else None,
        "by_type": by_type,                                   # 유형별 분포
    }
