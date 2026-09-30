# Ready-Q 백엔드를 Hugging Face Spaces 에 올리기 위한 이미지.
#
# Spaces 는 컨테이너의 7860 포트를 연다(README 의 app_port). 화면은 Vercel 에 따로 있고,
# 여기는 API 와 WebSocket 만 맡는다.
#
# 무료 CPU 티어에 맞춰 둔 것
#   - torch 는 CPU 전용 휠을 따로 받는다. PyPI 기본 휠은 CUDA 까지 끌고 와서 이미지가 2GB 넘게 커진다.
#   - 임베딩 모델(multilingual-e5-small, 약 470MB)을 빌드할 때 받아 이미지에 넣는다.
#     실행할 때 받으면 첫 발표 준비가 그만큼 느려진다.
#   - 디스크는 재시작하면 초기화된다. 올린 발표자료는 남지 않는다.

FROM python:3.11-slim

# 일부 의존성이 소스로 빌드될 때 필요하다
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Spaces 는 uid 1000 사용자로 돌린다. 루트로 쓴 파일은 실행할 때 쓰기가 막힌다.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8
WORKDIR /home/user/app

# torch 를 CPU 전용 저장소에서 먼저 깐다.
# 그냥 requirements 만 돌리면 PyPI 의 CUDA 빌드가 깔려서 nvidia 패키지까지 따라온다.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.13.0

# 의존성을 코드보다 먼저 깔아 두면 코드만 바뀌었을 때 이 층을 다시 만들지 않는다
COPY --chown=user requirements.txt ./requirements.txt
COPY --chown=user ai/requirements.txt ./ai/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 임베딩 모델을 이미지에 넣는다. 없으면 첫 질문 전에 내려받느라 1분 넘게 걸린다.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-small')"

COPY --chown=user . .

# 올린 자료와 색인이 들어갈 자리 (재시작하면 비워진다)
RUN mkdir -p data uploaded_files

EXPOSE 7860
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
