import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(
    prefix="/api/upload",
    tags=["Upload & Data Management"]
)

# 파일을 저장할 디렉토리 설정
UPLOAD_DIR = "uploaded_files"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    # 1. 파일 형식 검증 (PDF만 허용)
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")
    
    # 2. 고유 발표 ID(UUID) 발급
    presentation_id = str(uuid.uuid4())
    
    # 3. 파일 저장 (발급된 ID를 파일명으로 사용)
    file_path = os.path.join(UPLOAD_DIR, f"{presentation_id}.pdf")
    
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            # 4. 용량 검증 (예: 50MB 제한)
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="파일 용량은 50MB를 초과할 수 없습니다.")
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 중 오류 발생: {str(e)}")
        
    return {
        "status": "success", 
        "presentation_id": presentation_id,
        "filename": file.filename,
        "message": "파일 업로드 및 ID 발급이 완료되었습니다."
    }