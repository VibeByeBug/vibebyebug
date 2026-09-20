"""발표별 ReadyQ 인스턴스 보관 + 준비(warm) 상태 관리.

ReadyQ.warm() 은 임베딩 모델을 올리고 문서를 색인하는데, balanced 프리셋 기준
문서 289장에 약 62초가 걸린다. 업로드 응답에서 이걸 기다리면 요청이 1분 넘게
멈추므로, 별도 스레드로 돌리고 프론트가 상태를 물어보는 구조로 간다.

  업로드 → 인덱싱(빠름) → 즉시 응답 + warm 시작(느림)
                              ↓
  프론트가 상태 폴링 → '분석중' → '준비완료' → 질문 시작 버튼 활성화

warm() 은 파이썬 GIL 밖(모델 로딩·행렬 연산)에서 시간을 보내므로 스레드로 충분하다.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from ai_engine import ReadyQ

# 상태 값. 프론트의 '자료 준비 상태 화면'이 이 값으로 화면을 분기한다.
PENDING = "분석중"
READY = "준비완료"
FAILED = "실패"
MISSING = "없음"

_engines: dict[str, ReadyQ] = {}
_status: dict[str, dict] = {}
_lock = threading.Lock()


def _set(pid: str, **kw) -> None:
    with _lock:
        _status.setdefault(pid, {}).update(kw)


# 준비(임베딩 색인)가 동시에 여러 개 돌면 CPU 를 나눠 써서 진행 중인 발표의 질문 응답이
# 50ms 에서 1초 넘게 느려졌다. 한 번에 하나만 돌린다.
_warm_gate = threading.Semaphore(1)


def _warm_worker(pid: str, chunks_path: str, preset: str) -> None:
    with _warm_gate:
        _warm_worker_inner(pid, chunks_path, preset)


def _warm_worker_inner(pid: str, chunks_path: str, preset: str) -> None:
    t0 = time.time()
    try:
        # answer 모드로 만들어야 warm() 에서 답변 API 연결까지 미리 연다.
        # 키워드만 쓰는 연결은 rq.answer() 를 안 부르므로 영향이 없다.
        rq = ReadyQ(chunks_path, preset=preset, session=pid, mode="answer")
        took = rq.warm()
        # 발표자 설명(리허설, 대본, 설명 자료)이 있으면 검색 색인에 같이 넣는다
        import notes as notes_mod
        notes = notes_mod.NoteStore(Path(chunks_path).parent / "notes" / f"{pid}.json").notes
        if notes:
            rq.set_notes(notes)
        # 지도(발표자료 논리 지도, 지식 그래프)는 여기서 만들지 않는다. 지도 화면을 열 때 만든다.
        #   답변 경로에서 재봤더니 지도가 있으나 없으나 근거 슬라이드가 12문항 모두 같았고,
        #   답변에 든 사실도 잡음 범위 안이었다(2026-09-20, ai/README.md).
        #   지도를 안 보는 발표자에게 준비 시간 20초와 모델 호출 2회를 물리지 않는다.
        # 리허설 화면과 지도에서 볼 슬라이드 정리본 (보여주기용, 검색에는 안 쓴다)
        import slide_refine
        refined_file = Path(chunks_path).parent / "refined" / f"{pid}.json"
        refined = slide_refine.load(refined_file)
        if refined is None:
            import json as _json
            refined = slide_refine.refine([_json.loads(l) for l in Path(chunks_path).open(encoding="utf-8")])
            if refined:
                slide_refine.save(refined, refined_file)
        # 정리본의 묶음 단위로 슬라이드 지식 조각을 나눈다 (통합 지식 검색)
        rq.set_refined(refined or {})
        # 연습에서 확정해둔 기본 질문 카드를 올린다 (서버가 재시작돼도 유지)
        core_file = Path(chunks_path).parent / "core" / f"{pid}.json"
        if core_file.exists():
            import core_answers
            rq.set_core(core_answers.CoreStore(core_file).cards)
        with _lock:
            _engines[pid] = rq
        _set(pid, state=READY, warm_sec=round(took, 1),
             elapsed_sec=round(time.time() - t0, 1), error=None)
        print(f"✅ [준비완료] {pid} — warm {took:.1f}초 (preset={preset})")
    except Exception as e:
        _set(pid, state=FAILED, error=str(e),
             elapsed_sec=round(time.time() - t0, 1))
        print(f"❌ [준비실패] {pid} — {e}")


def start_warmup(pid: str, chunks_path: str | Path, preset: str = "balanced") -> None:
    """준비를 백그라운드로 시작한다. 이미 준비됐거나 진행 중이면 아무것도 안 한다."""
    with _lock:
        cur = _status.get(pid, {}).get("state")
        if cur in (PENDING, READY):
            return
        _status[pid] = {"state": PENDING, "preset": preset,
                        "started_at": time.time(), "error": None}

    threading.Thread(target=_warm_worker, args=(pid, str(chunks_path), preset),
                     daemon=True, name=f"warm-{pid[:8]}").start()


def get_status(pid: str) -> dict:
    """프론트가 폴링할 상태. 준비 중이면 경과 시간도 같이 준다."""
    with _lock:
        s = dict(_status.get(pid, {}))

    if not s:
        return {"presentation_id": pid, "state": MISSING, "ready": False,
                "message": "준비가 시작되지 않았습니다."}

    state = s.get("state")
    if state == PENDING:
        s["elapsed_sec"] = round(time.time() - s.get("started_at", time.time()), 1)

    s.pop("started_at", None)
    s["presentation_id"] = pid
    s["ready"] = state == READY
    s["message"] = {
        PENDING: "자료를 분석하고 있습니다. 잠시만 기다려주세요.",
        READY: "준비 완료! 질문을 시작할 수 있어요.",
        FAILED: f"자료 분석에 실패했습니다: {s.get('error')}",
    }.get(state, "")
    return s


def get_engine(pid: str):
    """질문 처리 시 쓸 ReadyQ. 아직 준비 안 됐으면 None."""
    with _lock:
        return _engines.get(pid)


def drop(pid: str) -> None:
    """자료가 삭제되면 엔진도 버린다."""
    with _lock:
        _engines.pop(pid, None)
        _status.pop(pid, None)
