# Ready-Q 실행 방법

팀원이 처음 돌릴 때 순서대로 따라 하면 된다. 백엔드와 프론트엔드를 둘 다 켜야 한다.

## 0. 준비물

| | 버전 | 확인 |
|---|---|---|
| Python | 3.11 이상 (3.13 에서 개발) | `python --version` |
| Node.js | 20.19 이상 또는 22.12 이상 | `node -v` |

Node 22.11 에서는 Vite 가 경고를 띄우거나 뜨지 않는다. 그때는 Node 를 올린다.

## 1. 백엔드

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS, Linux 는 source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` 가 `ai/requirements.txt` 까지 같이 깐다. 따로 깔면 버전이 갈린다.

### API 키

`ai/.env` 파일을 만들고 키를 넣는다. 이 파일은 깃에 올라가지 않으므로 사람마다 직접 만들어야 한다.

```
OPENAI_API_KEY=sk-...
```

키가 없으면 이런 일이 생긴다.

- 글자가 없는 이미지 슬라이드 자료는 **업로드가 실패한다** ("이미지 인식에 쓸 API 키가 없습니다").
- 글자가 있는 자료는 업로드와 검색까지 되지만, 추천 답변과 흐름도가 만들어지지 않는다.

### 서버 켜기

```bash
python -m uvicorn main:app --port 8000
```

켜지면 임베딩 모델을 뒤에서 미리 올린다(처음 한 번 60초 안팎, 그동안에도 업로드는 된다).

## 2. 프론트엔드

새 터미널에서

```bash
npm install
npm run dev
```

http://localhost:5173 으로 들어간다. 백엔드 주소는 기본이 `http://localhost:8000` 이고, 바꾸려면 `.env` 에 `VITE_API_URL` 을 적는다.

## 3. 잘 됐는지 확인

```bash
curl http://localhost:8000/api/health
```

- `빠진_패키지` 가 비어 있어야 한다. 있으면 `pip install -r requirements.txt` 를 다시 한다.
- `이미지_인식_키` 가 `null` 이면 `ai/.env` 가 없거나 키 이름이 틀린 것이다.
- `쓰기_가능_폴더` 에 `data` 와 `uploaded_files` 가 둘 다 있어야 한다.

## 업로드가 안 될 때

| 화면에 뜨는 말 | 원인 | 해결 |
|---|---|---|
| 서버에 연결하지 못했습니다 | 백엔드가 안 켜져 있다 | `uvicorn` 을 켠다. 포트 8000 이 맞는지 본다 |
| PDF 파일만 업로드 가능합니다 | PPTX 를 올렸다 | PowerPoint 에서 PDF 로 저장해서 올린다 |
| 이미지 인식에 쓸 API 키가 없습니다 | 글자 없는 슬라이드인데 `ai/.env` 가 없다 | 키를 넣고 서버를 다시 켠다 |
| 자료의 상당 부분에서 텍스트를 찾지 못했습니다 | 디자인 툴에서 이미지로 내보낸 자료 | 키를 넣으면 이미지로 읽는다 |
| 파일 용량은 50MB 를 초과할 수 없습니다 | 자료가 크다 | PDF 를 줄여서 올린다 |

## 자주 걸리는 곳

- **발표자료와 데이터는 깃에 올라가지 않는다.** `data/`, `uploaded_files/`, `*.pdf`, `*.pptx` 가 `.gitignore` 에 있다. 클론하면 발표가 하나도 없는 상태로 시작한다.
- **첫 발표 준비가 오래 걸린다.** 임베딩 모델을 올리는 시간이다. 서버를 켜두고 조금 기다렸다가 올리면 20초 안팎으로 끝난다.
- **준비(모델 로딩)가 끝나야** 실전 화면과 모의 연습을 쓸 수 있다. 준비 화면이 그 상태를 보여준다.
