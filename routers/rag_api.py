from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio

# Q&A 로그 저장을 위해 앞서 만든 함수를 가져옵니다.
from routers.log_api import save_qa_log

# '/api/rag' 경로로 시작하는 API들을 묶어주는 라우터 생성
router = APIRouter(
    prefix="/api/rag",
    tags=["RAG Engine"]
)

@router.post("/upload-ppt")
async def upload_presentation():
    """
    추후 AI 팀원(예진 님)이 PPT 문서를 업로드받아 
    ChromaDB(벡터DB)에 임베딩하는 로직을 구현할 자리입니다.
    """
    return {"status": "success", "message": "PPT 문서 파싱 및 DB 저장 API (구현 준비 중)"}

@router.get("/status")
async def check_rag_status():
    """RAG 엔진의 상태를 체크하는 테스트 API"""
    return {"status": "running", "vector_db": "ChromaDB (준비 중)"}

# ---------------------------------------------------------
# [프론트엔드에서 보낼 데이터 규격 정의]
# ---------------------------------------------------------
class TextQuestionRequest(BaseModel):
    presentation_id: str
    question: str

# ---------------------------------------------------------
# [비상용 텍스트 입력 API] STT 장애 시 대체 동작
# ---------------------------------------------------------
@router.post("/fallback/ask")
async def ask_question_by_text(req: TextQuestionRequest):
    """
    [비상용 API] 마이크나 웹소켓이 끊어졌을 때, 텍스트 입력으로 질문을 처리합니다.
    """
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="질문 내용이 비어있습니다.")
        
    print(f"⌨️ 비상 텍스트 수신: {req.question}")
    
    # 1. AI 처리 시간 시뮬레이션
    await asyncio.sleep(1.0)
    
    # 2. 결과 상태 분기 (Mock)
    if "테스트" in req.question:
        status = "우회"
        answer = "해당 질문은 발표 주제와 무관하거나 근거를 찾을 수 없습니다."
    else:
        status = "성공"
        answer = f"'{req.question}'에 대한 핵심 방어 논리입니다."
        
    # 3. 로그 저장소에 기록 (import 해온 save_qa_log 사용)
    save_qa_log(
        presentation_id=req.presentation_id,
        question=req.question,
        answer=answer,
        status=status
    )
    
    return {
        "status": "success",
        "qa_result": {
            "question": req.question,
            "answer": answer,
            "type": status
        }
    }