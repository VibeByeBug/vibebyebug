---
title: Ready-Q Backend
emoji: 🎬
colorFrom: red
colorTo: gray
sdk: gradio
sdk_version: 6.29.0
app_file: app.py
pinned: false
short_description: 발표 질의응답 프롬프터 Ready-Q 의 백엔드
---

# Ready-Q 백엔드

발표 질의응답 프롬프터 Ready-Q 의 API 와 WebSocket 서버다. 화면(프론트엔드)은 Vercel 에 따로 있다.

VibeByeBug 팀, 26-2 명지대학교 바이브코딩 경진대회

## 이 Space 가 하는 일

- 발표자료(PDF) 업로드와 색인
- 질문을 받아 근거 슬라이드, 추천 답변, 말할 순서를 WebSocket 으로 보내기
- 모의 연습 예상 질문 생성과 근거 커버리지 판정
- 질문 기록과 사후 리포트 데이터

## 설정

Space Secrets 에 `OPENAI_API_KEY` 를 넣어야 추천 답변과 예상 질문이 만들어진다.
키가 없어도 서버는 뜨고, 글자가 있는 PDF 의 업로드와 근거 검색까지는 동작한다.

상태 확인은 `/api/health` 에서 한다. 빠진 패키지, API 키 인식 여부, 임베딩 모델 준비 여부를 함께 준다.

## 알아둘 것

- 디스크는 재시작하면 비워진다. 올린 발표자료와 색인은 남지 않는다.
- 무료 티어는 한동안 아무도 들어오지 않으면 잠든다. 다시 열면 깨어나는 데 1~2분 걸린다.
- 발표 준비(색인)는 자료 한 건에 20초 안팎 걸린다.
- Docker SDK 가 아니라 Gradio SDK 로 올린다. 2026년 7월부터 무료 계정은 Docker Space 를
  만들 수 없다. `app.py` 가 Gradio 대신 FastAPI 를 7860 포트에 띄운다.
  `Dockerfile` 은 유료로 바꿀 때를 위해 남겨 뒀다.
- 임베딩 모델은 처음 켤 때 내려받는다. 서버가 뜬 뒤 1~2분은 발표 준비가 느리다.

코드와 설치 방법은 GitHub 저장소를 참고한다. https://github.com/VibeByeBug/vibebyebug
