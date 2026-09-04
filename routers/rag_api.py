from fastapi import APIRouter

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