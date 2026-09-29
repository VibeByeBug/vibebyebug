from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import time

import engine_store

# '/api/rag' 경로로 시작하는 API들을 묶어주는 라우터 생성
router = APIRouter(
    prefix="/api/rag",
    tags=["RAG Engine"]
)

@router.get("/status")
async def check_rag_status():
    """RAG 엔진 상태. 준비된 발표가 몇 개인지 돌려준다.

    업로드·인덱싱은 /api/upload/pdf 로 옮겨갔다.
    검색기는 ChromaDB 가 아니라 BM25 + e5-small 하이브리드를 쓴다
    (실측 비교 결과, ai/README.md 참고).
    """
    return {"status": "running", "retriever": "BM25 + e5-small (hybrid)"}

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
    # ⏱️ 계측 시작
    start_time = time.time()
    
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="질문 내용이 비어있습니다.")
        
    print(f"⌨️ 비상 텍스트 수신: {req.question}")

    rq = engine_store.get_engine(req.presentation_id)
    if rq is None:
        # 음성 경로(WebSocket)와 같은 이유로 명시적으로 알린다.
        st = engine_store.get_status(req.presentation_id)
        raise HTTPException(status_code=409, detail={
            "reason": "not_ready",
            "message": "자료가 아직 준비되지 않았습니다.",
            **st,
        })

    # 음성 경로와 완전히 같은 함수를 부른다. 입력 수단만 다를 뿐
    # 결과가 달라지면 안 된다. (cue() 는 동기 함수라 스레드로 넘긴다)
    cue = await asyncio.to_thread(rq.cue, req.question)
    payload = cue.to_message()

    # 기록은 ReadyQ 가 직접 남긴다(data/qa_log.jsonl).
    # 여기서 또 저장하면 같은 질문이 두 군데 쌓이고 사후 리포트가 어긋난다.

    # ⏱️ 계측 종료 및 계산
    latency = round(time.time() - start_time, 3)
    payload["server_latency_ms"] = round(latency * 1000, 1)
    print(f"⏱️ [지연시간 계측] Fallback status={cue.status} "
          f"AI {cue.latency_ms}ms / API 처리 {latency}초")

    return payload