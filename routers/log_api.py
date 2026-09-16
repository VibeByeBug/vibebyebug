import os
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/logs",
    tags=["Q&A Logs"]
)

# 로그를 저장할 로컬 JSON 파일 경로
LOG_FILE = "qa_logs.json"

# ---------------------------------------------------------
# [백엔드 내부용 함수] AI 통신이 끝난 후 로그를 기록할 때 사용
# ---------------------------------------------------------
def save_qa_log(presentation_id: str, question: str, answer: str, status: str):
    # 1. 기존 로그 파일 읽기
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            logs = json.load(f)
    else:
        logs = {}
        
    # 2. 해당 발표 ID의 공간이 없으면 생성
    if presentation_id not in logs:
        logs[presentation_id] = []
        
    # 3. 새로운 Q&A 로그 딕셔너리 생성
    log_entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "question": question,
        "answer": answer,
        "status": status # 예: "성공", "우회", "근거 없음"
    }
    
    # 4. 리스트에 추가 후 파일 덮어쓰기
    logs[presentation_id].append(log_entry)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(logs, f, ensure_ascii=False, indent=4)


# ---------------------------------------------------------
# [프론트엔드용 API] 특정 발표의 전체 Q&A 기록(리포트) 조회
# ---------------------------------------------------------
@router.get("/{presentation_id}")
async def get_presentation_logs(presentation_id: str):
    if not os.path.exists(LOG_FILE):
        return {"presentation_id": presentation_id, "logs": []}
        
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        logs = json.load(f)
        
    if presentation_id not in logs:
        return {"presentation_id": presentation_id, "logs": []}
        
    return {
        "status": "success",
        "presentation_id": presentation_id,
        "logs": logs[presentation_id]
    }