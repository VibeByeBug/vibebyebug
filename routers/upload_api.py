import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

from indexing import build_index, chunks_path
import engine_store

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
        
    # 5. 검색용 청크 생성 (ReadyQ 는 chunks.jsonl 이 있어야 뜬다)
    #    텍스트가 한 글자도 안 나오면 여기서 실패로 알린다 - 조용히 넘기면
    #    발표자가 '검색이 안 되는 자료'인 줄 모른 채 발표에 들어가게 된다.
    index = build_index(file_path, presentation_id)

    if not index["ok"]:
        os.remove(file_path)   # 쓸 수 없는 자료는 남겨두지 않는다
        raise HTTPException(status_code=422, detail={
            "reason": index["reason"],
            "message": index["message"],
            "next": index.get("next"),
        })

    # 6. 준비(warm) 를 백그라운드로 시작한다.
    #    임베딩 모델 로딩 + 색인이 1분 가까이 걸리므로 여기서 기다리지 않는다.
    #    프론트는 /api/upload/status/{id} 를 폴링해 '준비완료' 를 기다린다.
    engine_store.start_warmup(presentation_id, index["chunks_path"])

    return {
        "status": "success",
        "presentation_id": presentation_id,
        "filename": file.filename,
        "slides": index["slides"],
        "state": engine_store.PENDING,
        "quality": index["quality"],      # 준비 상태 화면에서 '근거로 못 쓰는 슬라이드' 고지용
        "method": index["method"],
        "captioned": index["captioned"],
        "unreadable": index["unreadable"],
        "unreadable_message": index["unreadable_message"],
        "api_calls": index["api_calls"],
        "message": "파일 업로드 및 자료 분석이 완료되었습니다."
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
        # 청크도 같이 지운다. 안 그러면 자료는 없는데 검색은 되는 상태가 된다.
        chunks = chunks_path(presentation_id)
        if chunks.exists():
            chunks.unlink()
        engine_store.drop(presentation_id)
        return {"status": "success", "message": f"{presentation_id} 파일이 삭제되었습니다."}
    else:
        raise HTTPException(status_code=404, detail="해당 파일을 찾을 수 없습니다.")


@router.get("/status/{presentation_id}")
async def presentation_status(presentation_id: str):
    """자료 준비 상태. 프론트의 '자료 준비 상태 화면'이 이걸 폴링한다.

    state: 분석중 / 준비완료 / 실패 / 없음
    """
    st = engine_store.get_status(presentation_id)

    # 서버가 재시작되면 엔진이 사라진다. 청크가 남아 있으면 다시 준비를 건다.
    if st["state"] == engine_store.MISSING and chunks_path(presentation_id).exists():
        engine_store.start_warmup(presentation_id, chunks_path(presentation_id))
        st = engine_store.get_status(presentation_id)

    return st
