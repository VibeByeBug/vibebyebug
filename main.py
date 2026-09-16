import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.requests import Request
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

from routers import rag_api, upload_api   

load_dotenv()

app = FastAPI()
app.include_router(upload_api.router)

app.include_router(rag_api.router)

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
            print(f"🎤 수신(STT): {user_voice_text}")
            
            # 1. 빈 질문 및 잡음 방어 로직 (PM 요구사항)
            if not user_voice_text or not user_voice_text.strip():
                await manager.send_message("⚠️ [시스템] 인식된 음성이 없거나 너무 짧습니다.", websocket)
                continue
            
            # 2. AI 모듈(RAG) 연결 대기 상태
            # 추후 예진 님이 작성하신 ai.pipeline.py 로직이 이 자리에 들어옵니다.
            await manager.send_message(f"✅ 질문 수신 완료: {user_voice_text}", websocket)
            
    except WebSocketDisconnect:
        # 클라이언트가 브라우저를 끄거나 새로고침할 때 발생하는 예외 처리
        manager.disconnect(websocket)
        print("⚠️ 클라이언트와의 웹소켓 연결이 끊어졌습니다.")
    except Exception as e:
        # 3. 예기치 못한 런타임 에러 및 네트워크 장애 방어
        print(f"❌ 웹소켓 통신 에러 발생: {str(e)}")
        manager.disconnect(websocket)