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

@router.get("/list")
async def list_presentations():
    """서버에 저장된 모든 PDF 발표 자료 목록을 반환합니다."""
    if not os.path.exists(UPLOAD_DIR):
        return {"status": "success", "files": []}
        
    files = []
    for filename in os.listdir(UPLOAD_DIR):
        if filename.endswith(".pdf"):
            presentation_id = filename.replace(".pdf", "")
            # 파일의 크기(MB)와 수정 시간도 함께 전달하면 프론트에서 보여주기 좋습니다.
            file_path = os.path.join(UPLOAD_DIR, filename)
            size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 2)
            
            files.append({
                "presentation_id": presentation_id,
                "filename": filename,
                "size_mb": size_mb
            })
            
    return {"status": "success", "files": files}

@router.delete("/{presentation_id}")
async def delete_presentation(presentation_id: str):
    """특정 발표 ID의 PDF 파일을 서버에서 삭제합니다."""
    file_path = os.path.join(UPLOAD_DIR, f"{presentation_id}.pdf")
    
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"status": "success", "message": f"{presentation_id} 파일이 삭제되었습니다."}
    else:
        raise HTTPException(status_code=404, detail="해당 파일을 찾을 수 없습니다.")