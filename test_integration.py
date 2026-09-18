"""AI 모듈 연결 통합 테스트.

    python test_integration.py <텍스트가_들어있는.pdf>

실제 서버를 띄우지 않고 FastAPI TestClient 로 전 구간을 돌린다.
업로드 -> 인덱싱 -> 준비(warm) -> 질문(음성/텍스트) -> 로그 -> 삭제.
"""

import io
import json
import sys
import time
from pathlib import Path

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    mark = "OK  " if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f"  - {detail}" if detail else ""))
    return cond


def main() -> int:
    text_pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not text_pdf or not text_pdf.exists():
        print("사용법: python test_integration.py <텍스트가_들어있는.pdf>")
        return 1

    print("=" * 62)
    print("Ready-Q 통합 테스트")
    print("=" * 62)

    # [0] import
    print("\n[0] 모듈 import")
    try:
        from fastapi.testclient import TestClient
        import main as app_main
        import ai_engine, indexing, engine_store
        from ai_engine import ReadyQ
        check("모든 모듈 import", True)
    except Exception as e:
        check("모든 모듈 import", False, repr(e))
        return 1

    c = TestClient(app_main.app)

    # [1] 업로드 입력 검증
    print("\n[1] 업로드 입력 검증")
    r = c.post("/api/upload/pdf",
               files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")})
    check("PDF 아닌 파일 거부", r.status_code == 400, f"HTTP {r.status_code}")

    r = c.post("/api/upload/pdf",
               files={"file": ("x.pdf", io.BytesIO(b"%PDF-1.4 broken"), "application/pdf")})
    check("깨진 PDF 거부", r.status_code in (422, 500), f"HTTP {r.status_code}")

    # [2] 업로드 -> 인덱싱
    print("\n[2] 업로드 -> 인덱싱")
    with text_pdf.open("rb") as f:
        r = c.post("/api/upload/pdf",
                   files={"file": (text_pdf.name, f, "application/pdf")})
    ok = check("업로드 성공", r.status_code == 200, f"HTTP {r.status_code}")
    if not ok:
        print("   ", r.text[:300])
        return 1
    up = r.json()
    pid = up["presentation_id"]
    check("슬라이드 수 반환", up.get("slides", 0) > 0, f"{up.get('slides')}장")
    check("품질 판정 포함", "quality" in up, up.get("quality", {}).get("verdict"))
    check("청크 파일 생성", indexing.chunks_path(pid).exists())
    check("준비 상태 = 분석중", up.get("state") == engine_store.PENDING, up.get("state"))

    # [3] 준비(warm)
    print("\n[3] 준비 상태 폴링")
    r = c.get("/api/upload/status/없는-아이디")
    check("없는 발표 -> 없음", r.json().get("state") == engine_store.MISSING)

    t0 = time.time()
    st = {}
    while time.time() - t0 < 300:
        st = c.get(f"/api/upload/status/{pid}").json()
        if st.get("ready") or st.get("state") == engine_store.FAILED:
            break
        time.sleep(2)
    check("준비 완료 도달", st.get("ready") is True,
          f"warm {st.get('warm_sec')}초 / state={st.get('state')}")
    check("엔진 획득 가능", engine_store.get_engine(pid) is not None)

    # [4] WebSocket
    print("\n[4] WebSocket")
    Q = "이 문서의 주요 내용은 무엇인가요?"
    voice = {}
    with c.websocket_connect("/ws") as ws:
        ws.send_text(json.dumps({"type": "stt.final", "text": Q}))
        m = ws.receive_json()
        check("발표 미지정 시 not_ready", m.get("type") == "not_ready", m.get("type"))

        ws.send_text(json.dumps({"type": "session.start", "presentation_id": pid}))
        m = ws.receive_json()
        check("session.start 응답", m.get("type") == "session.ready" and m.get("ready"))

        ws.send_text(json.dumps({"type": "stt.final", "text": Q}))
        voice = ws.receive_json()
        check("정상 질문 -> cue.evidence", voice.get("type") == "cue.evidence",
              f"status={voice.get('status')}")
        check("필수 필드 존재",
              all(k in voice for k in ("status", "question_type", "keywords",
                                       "sources", "advice", "latency_ms")))

        ws.send_text(json.dumps({"type": "stt.final", "text": "음..."}))
        m = ws.receive_json()
        check("잡음 -> ignored", m.get("status") == "ignored", m.get("status"))
        check("잡음은 근거 없음", m.get("sources") == [])

        ws.send_text(json.dumps({"type": "stt.final", "text": "오늘 저녁 뭐 먹지?"}))
        m = ws.receive_json()
        check("무관한 질문 -> no_evidence", m.get("status") == "no_evidence", m.get("status"))
        check("우회 화법 제공", len(m.get("advice", [])) > 0)

        ws.send_text(json.dumps({"type": "stt.partial", "text": "부분"}))
        ws.send_text(json.dumps({"type": "stt.final", "text": Q}))
        m = ws.receive_json()
        check("stt.partial 무시됨", m.get("type") == "cue.evidence")

        ws.send_text(Q)
        m = ws.receive_json()
        check("평문 입력 호환", m.get("type") == "cue.evidence")

        ws.send_text(json.dumps({"type": "이상한타입"}))
        m = ws.receive_json()
        check("모르는 타입 -> error", m.get("type") == "error", m.get("message"))

    # [5] 텍스트 폴백
    print("\n[5] 텍스트 폴백 (fallback/ask)")
    r = c.post("/api/rag/fallback/ask", json={"presentation_id": pid, "question": Q})
    check("정상 질문 200", r.status_code == 200, f"HTTP {r.status_code}")
    text = r.json()
    same = (text.get("status") == voice.get("status")
            and text.get("question_type") == voice.get("question_type")
            and [s["slide"] for s in text.get("sources", [])]
                == [s["slide"] for s in voice.get("sources", [])]
            and text.get("keywords") == voice.get("keywords"))
    check("음성 경로와 결과 동일", same,
          f"{[s['slide'] for s in text.get('sources', [])]}")

    r = c.post("/api/rag/fallback/ask", json={"presentation_id": pid, "question": "   "})
    check("빈 질문 400", r.status_code == 400, f"HTTP {r.status_code}")

    r = c.post("/api/rag/fallback/ask", json={"presentation_id": "없음", "question": Q})
    check("미준비 발표 409", r.status_code == 409, f"HTTP {r.status_code}")

    # [6] 로그
    print("\n[6] 로그 / 회고 집계")
    logs = c.get(f"/api/logs/{pid}").json()
    check("로그 조회", logs.get("count", 0) > 0, f"{logs.get('count')}건")
    row = logs["logs"][0] if logs.get("logs") else {}
    check("로그에 AI 정보 포함",
          all(k in row for k in ("qtype", "status", "slides", "latency_ms")))

    s = c.get(f"/api/logs/{pid}/summary").json()
    check("회고 집계", s.get("total", 0) > 0,
          f"총{s.get('total')} 근거찾음{s.get('answered')} "
          f"근거없음{s.get('no_evidence')} 평균{s.get('avg_latency_ms')}ms")
    check("유형별 분포 포함", isinstance(s.get("by_type"), dict) and bool(s.get("by_type")))
    check("이중 기록 없음", not Path("qa_logs.json").exists())

    # [7] 기타 API
    print("\n[7] 기타")
    r = c.get("/api/rag/status")
    check("RAG 상태 API", r.status_code == 200, r.json().get("retriever"))
    r = c.get("/api/upload/list")
    check("자료 목록 API", r.status_code == 200, f"{len(r.json().get('files', []))}건")
    r = c.get("/")
    check("테스트 페이지 렌더", r.status_code == 200)

    # [8] 삭제
    print("\n[8] 삭제 정리")
    r = c.delete(f"/api/upload/{pid}")
    check("삭제 성공", r.status_code == 200)
    check("청크 파일도 삭제", not indexing.chunks_path(pid).exists())
    check("엔진도 정리", engine_store.get_engine(pid) is None)

    # 결과
    print("\n" + "=" * 62)
    print(f"통과 {len(PASS)} / 실패 {len(FAIL)}   (총 {len(PASS) + len(FAIL)})")
    if FAIL:
        print("\n실패 항목:")
        for f in FAIL:
            print(f"  FAIL  {f}")
    print("=" * 62)
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
