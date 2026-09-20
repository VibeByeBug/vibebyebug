import asyncio
import json
import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.requests import Request
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

from routers import rag_api, upload_api, log_api, core_api, graph_api, notes_api, slides_api, practice_api
import engine_store

load_dotenv()

app = FastAPI()
app.include_router(upload_api.router)
app.include_router(rag_api.router)
app.include_router(log_api.router)
app.include_router(core_api.router)
app.include_router(graph_api.router)
app.include_router(notes_api.router)
app.include_router(slides_api.router)
app.include_router(practice_api.router)

# ---------------------------------------------------------
# [보안 설정] CORS 미들웨어 추가 (프론트엔드 접속 허용)
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"],  # 지금은 개발 중이라 모든 도메인("*")의 접근을 허용합니다. (추후 배포 시 프론트엔드 주소로 한정)
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST 등 모든 통신 방식 허용
    allow_headers=["*"],  # 모든 헤더 허용
)

@app.get("/api/health")
def health() -> dict:
    """설치가 제대로 됐는지 한 번에 본다. 팀원이 처음 돌릴 때 여기부터 열어보면 된다.

    업로드가 안 되는 이유는 대개 셋 중 하나다: 백엔드 미실행, 이미지 자료인데 API 키 없음,
    PDF 가 아닌 파일. 앞의 둘을 여기서 알려준다.
    """
    import shutil
    import sys
    from pathlib import Path as _Path

    import caption

    ok_dirs = []
    for name in ("data", "uploaded_files"):
        d = _Path(name)
        try:
            d.mkdir(parents=True, exist_ok=True)
            probe = d / ".write_test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            ok_dirs.append(name)
        except Exception:
            pass

    provider = caption.detect_provider()
    missing = []
    for mod in ("fitz", "pptx", "kiwipiepy", "sentence_transformers", "openai"):
        try:
            __import__(mod)
        except Exception:
            missing.append(mod)

    return {
        "ok": not missing and len(ok_dirs) == 2,
        "python": sys.version.split()[0],
        "빠진_패키지": missing,          # 있으면 pip install -r requirements.txt
        "쓰기_가능_폴더": ok_dirs,
        "이미지_인식_키": provider or None,   # None 이면 글자 없는 슬라이드를 못 읽는다
        "임베딩_모델_준비": engine_store.model_ready(),
        "model_ready": engine_store.model_ready(),   # 준비 화면이 남은 시간을 어림잡는 데 쓴다
        "준비된_발표": engine_store.ready_ids(),
        "디스크_여유_GB": round(shutil.disk_usage(".").free / 1e9, 1),
    }


# 임베딩 모델을 서버가 켜질 때 미리 올린다 (첫 발표가 모델 로딩을 혼자 부담하지 않게)
@app.on_event("startup")
def _preload() -> None:
    engine_store.preload_model()


# HTML 템플릿 폴더 지정
templates = Jinja2Templates(directory="templates")

# ---------------------------------------------------------
# [웹소켓 세션 매니저] 클라이언트 연결/해제를 객체지향적으로 관리
# ---------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ 클라이언트 접속 (현재 연결 수: {len(self.active_connections)})")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"❌ 클라이언트 연결 종료 (현재 연결 수: {len(self.active_connections)})")

    async def send_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

manager = ConnectionManager()

# ---------------------------------------------------------
# [API 라우팅 영역]
# ---------------------------------------------------------
@app.get("/")
async def get(request: Request):
    # request와 name에 이름표를 붙여 명시적으로 전달!
    return templates.TemplateResponse(request=request, name="index.html")

def _parse(raw: str) -> dict:
    """들어온 메시지를 계약 형태로 정규화한다.

    계약은 JSON 이지만, 평문만 보내는 옛 클라이언트도 있으므로 감싸서 받아준다.
    (프론트가 JSON 으로 전환하는 동안 데모가 멈추지 않게 하기 위해서다)
    """
    raw = (raw or "").strip()
    if raw.startswith("{"):
        try:
            msg = json.loads(raw)
            msg.setdefault("type", "stt.final")
            return msg
        except json.JSONDecodeError:
            pass
    return {"type": "stt.final", "text": raw}


async def _send_extra(websocket: WebSocket, rq, text: str, cue, mode: str, lock: asyncio.Lock | None = None) -> None:
    it = rq.answer(text, cue) if mode == "answer" else rq.flow(text, cue)
    while True:
        part = await asyncio.to_thread(next, it, None)
        if part is None:
            break
        if lock is None:
            await websocket.send_json(part)
        else:
            async with lock:
                await websocket.send_json(part)
        if part.get("done"):
            print(f"💬 [{mode}] status={part.get('status')} "
                  f"첫 칸 {part.get('first_ms')}ms / 끝 {part.get('latency_ms')}ms")


async def _send_both(websocket: WebSocket, rq, text: str, cue) -> None:
    """추천 답변(위)과 흐름도(아래)를 같이 만든다. 따로 기다리지 않게 동시에 돌린다.

    화면은 추천 답변을 크게, 그 아래 흐름도를 띄운다(키워드만 보는 모드는 없앴다).
    두 흐름이 같은 연결로 메시지를 보내므로 한 번에 하나씩 보내도록 잠근다.
    """
    lock = asyncio.Lock()
    await asyncio.gather(_send_extra(websocket, rq, text, cue, "answer", lock),
                         _send_extra(websocket, rq, text, cue, "flow", lock))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    presentation_id = None      # 이 연결이 다루는 발표. session.start 로 정한다.
    session_mode = "both"       # both(추천 답변 + 흐름도) | answer | flow | keywords(옛 화면)
    last = None                 # (질문, cue, 엔진) — 답을 받은 뒤 모드를 바꾸면 이걸로 다시 만든다
    try:
        while True:
            msg = _parse(await websocket.receive_text())
            mtype = msg.get("type")

            # ── 어느 발표에 대한 질문인지 정한다
            if mtype == "session.start":
                presentation_id = msg.get("presentation_id")
                session_mode = msg.get("mode") or session_mode
                st = engine_store.get_status(presentation_id) if presentation_id else {}
                await websocket.send_json({"type": "session.ready", **st})
                continue

            # ── 이미 받은 질문을 다른 모드로 다시 보고 싶을 때 (흐름도 → 추천 답변 등).
            #    검색은 다시 하지 않고 직전 결과로 그 모드의 답만 만든다. 기록도 두 번 남기지 않는다.
            if mtype == "cue.extra":
                mode = msg.get("mode")
                if last is None or mode not in ("answer", "flow"):
                    continue
                text, cue, rq = last
                await _send_extra(websocket, rq, text, cue, mode)
                continue

            # ── 말하는 중. 투기적 검색은 아직 붙이지 않았으므로 흘려보낸다.
            if mtype == "stt.partial":
                continue

            if mtype != "stt.final":
                await websocket.send_json(
                    {"type": "error", "message": f"모르는 메시지 형식입니다: {mtype}"})
                continue

            # ── 발화 종료. 여기서부터 계측한다.
            start_time = time.time()
            text = (msg.get("text") or "").strip()
            pid = msg.get("presentation_id") or presentation_id
            print(f"🎤 수신(STT): {text}")

            rq = engine_store.get_engine(pid) if pid else None
            if rq is None:
                # 자료가 아직 준비되지 않았다. 조용히 넘기면 발표자는
                # '왜 아무것도 안 뜨지' 하고 원인을 모른다.
                st = engine_store.get_status(pid) if pid else {"state": engine_store.MISSING}
                await websocket.send_json({
                    "type": "not_ready",
                    "message": "자료가 아직 준비되지 않았습니다." if pid
                               else "발표 자료를 먼저 선택해주세요.",
                    **st,
                })
                continue

            # cue() 는 동기 함수다. 이벤트 루프를 막지 않도록 스레드로 넘긴다.
            cue = await asyncio.to_thread(rq.cue, text)
            payload = cue.to_message()

            # ⏱️ 계측 종료 및 계산
            latency = round(time.time() - start_time, 3)
            payload["server_latency_ms"] = round(latency * 1000, 1)
            print(f"⏱️ [지연시간 계측] status={cue.status} "
                  f"AI {cue.latency_ms}ms / 웹소켓 왕복 {latency}초")

            await websocket.send_json(payload)
            last = (text, cue, rq)

            # ── 추천 답변, 흐름도 모드면 키워드를 보낸 뒤에 이어서 보낸다
            mode = msg.get("mode") or session_mode
            if mode == "both":
                await _send_both(websocket, rq, text, cue)
            elif mode in ("answer", "flow"):
                await _send_extra(websocket, rq, text, cue, mode)
            elif not cue.sources and not cue.core and cue.status != "ignored":
                # 키워드 모드인데 슬라이드 근거 카드가 없다. 키워드만으로는 할 말이 없으니
                # 전체 자료(슬라이드, 대본, 설명 자료, 슬라이드 지도)로 추천 답변을 한 번 만들어 보낸다.
                await _send_extra(websocket, rq, text, cue, "answer")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("⚠️ 클라이언트와의 웹소켓 연결이 끊어졌습니다.")
    except Exception as e:
        print(f"❌ 웹소켓 통신 에러 발생: {str(e)}")
        manager.disconnect(websocket)