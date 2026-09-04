import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.requests import Request
from fastapi.templating import Jinja2Templates
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

from routers import rag_api 

load_dotenv()

app = FastAPI()

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

# Gemini 설정
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel(
    model_name="gemini-3.6-flash",
    system_instruction="너는 발표자를 돕는 방어 프롬프터야. 들어온 질문의 핵심 요지만 1줄(20자 이내)로 짧고 객관적으로 요약해. 서론은 다 빼고 핵심 키워드만 출력해."
)

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
            print(f"🎤 수신: {user_voice_text}")
            
            # Gemini 요약 로직
            try:
                response = await model.generate_content_async(user_voice_text)
                ai_summary = response.text.strip()
            except Exception as e:
                ai_summary = f"[API 오류] {str(e)}"
            
            # 매니저를 통해 결과 전송
            await manager.send_message(f"💡 AI 요약: {ai_summary}", websocket)
            
    except WebSocketDisconnect:
        # 클라이언트가 브라우저를 끄거나 새로고침할 때 발생하는 예외 처리
        manager.disconnect(websocket)