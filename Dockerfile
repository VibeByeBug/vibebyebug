# Ready-Q 백엔드를 Google Cloud Run 에 올리기 위한 이미지.
#
# 화면은 Vercel 에 따로 있고, 여기는 API 와 WebSocket 만 맡는다.
#
# Cloud Run 에 맞춘 것
#   - 포트는 Cloud Run 이 PORT 로 알려준다. 8080 은 그게 없을 때의 값이다.
#   - torch 는 CPU 전용 휠을 받는다. 기본 휠은 CUDA 까지 끌고 와서 이미지가 2GB 넘게 커진다.
#   - 임베딩 모델(multilingual-e5-small, 약 470MB)을 빌드할 때 받아 이미지에 넣는다.
#     실행할 때 받으면 인스턴스가 새로 뜰 때마다 그만큼 느려진다.
#   - 파일 시스템이 메모리를 쓴다. 올린 발표자료와 색인 결과가 메모리에서 빠진다는 뜻이다.
#     인스턴스가 내려가면 같이 사라진다.

FROM python:3.11-slim

# 일부 의존성이 소스로 빌드될 때 필요하다
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 모델 캐시를 이미지 안에 둔다. 실행할 때 쓰기 가능한 곳이어야 한다.
ENV HF_HOME=/app/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PORT=8080

# torch 를 CPU 전용 저장소에서 먼저 깐다.
# 그냥 requirements 만 돌리면 PyPI 의 CUDA 빌드가 깔려서 nvidia 패키지까지 따라온다.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.13.0

# 의존성을 코드보다 먼저 깔면 코드만 바뀌었을 때 이 층을 다시 만들지 않는다
COPY requirements.txt ./requirements.txt
COPY ai/requirements.txt ./ai/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 임베딩 모델을 이미지에 넣는다. 없으면 첫 질문 전에 내려받느라 1분 넘게 걸린다.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-small')"

COPY . .

# 올린 자료와 색인이 들어갈 자리
RUN mkdir -p data uploaded_files

# PORT 를 읽어야 해서 셸 형식으로 쓴다. exec 를 붙여야 종료 신호가 uvicorn 까지 간다.
CMD exec python -m uvicorn main:app --host 0.0.0.0 --port ${PORT}
