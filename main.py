import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.requests import Request
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

from routers import rag_api, upload_api, log_api

load_dotenv()

app = FastAPI()
app.include_router(upload_api.router)
app.include_router(rag_api.router)
app.include_router(log_api.router)

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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            user_voice_text = await websocket.receive_text()
            # ⏱️ 계측 시작
            start_time = time.time()
            print(f"🎤 수신(STT): {user_voice_text}")
            
            if not user_voice_text or not user_voice_text.strip():
                await manager.send_message("⚠️ [시스템] 인식된 음성이 없거나 너무 짧습니다.", websocket)
                continue
            
            # (여기에 AI 팀원이 작성한 파이프라인 모듈이 얹혀질 예정입니다)
            
            # ⏱️ 계측 종료 및 계산
            end_time = time.time()
            latency = round(end_time - start_time, 3)
            print(f"⏱️ [지연시간 계측] 웹소켓 응답까지 {latency}초 소요")
            
            await manager.send_message(f"✅ 질문 수신 완료: {user_voice_text}", websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("⚠️ 클라이언트와의 웹소켓 연결이 끊어졌습니다.")
    except Exception as e:
        print(f"❌ 웹소켓 통신 에러 발생: {str(e)}")
        manager.disconnect(websocket)