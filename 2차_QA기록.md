# Ready-Q project — 2차 QA : Backend + AI 통합

2026년 9월 16일 · 조은비 (PM+QA)

브랜치 : `feature/integration` (`feature/backend` `a2b3d9d` 에서 분기)

---

## 수정 사항 요약

| # | 항목 | 변경 파일 |
|---|---|---|
| 1 | **AI 모듈 import 경로 연결** | `ai_engine.py` 신규 |
| 2 | **업로드 인덱싱 연결** — 업로드 API가 PDF를 저장만 하고 끝나서 `ReadyQ`가 요구하는 `chunks.jsonl`이 생성되지 않던 구간을 이음 | `indexing.py` 신규, `upload_api.py` 수정 |
| 3 | **`warm()` 백그라운드 처리 + 준비 상태 API** — 준비 작업이 수십 초~2분 걸려 업로드 응답을 막던 문제를 별도 스레드로 분리. `분석중`/`준비완료`/`실패` 상태를 폴링할 수 있는 엔드포인트 추가 | `engine_store.py` 신규 |
| 4 | **WebSocket에 `cue()` 연결** | `main.py`, `templates/index.html` 수정 |
| 5 | **텍스트 폴백 API 실제 응답으로 교체** — 음성 경로와 동일한 함수·동일한 형태로 통일해 프론트가 렌더링 코드를 하나만 유지하면 되게 함 | `rag_api.py` 수정 |
| 6 | **Q&A 로그 단일화** — `ReadyQ`가 자동 기록하는 `data/qa_log.jsonl`과 백엔드의 `qa_logs.json`에 같은 질문이 이중으로 쌓이던 문제 해결 | `log_api.py` 전면 재작성 |
| 7 | **`requirements.txt` 작성 및 환경 구성 이슈 수정** — 검증 중 `pywin32==308` 고정 때문에 Python 3.14에서 설치 자체가 실패하는 버그를 발견해 `>=308`로 완화 | `requirements.txt` 신규, `ai/requirements.txt` 수정 |
| 8 | **통합 테스트 작성** — 업로드→인덱싱→준비→질문→로그→삭제 전 구간을 자동 검증하는 테스트 37개 작성. 실행 중 손상된 PDF 업로드 시 예외가 잡히지 않아 서버가 죽고 못 쓰는 파일이 서버에 쌓이는 버그를 발견해 수정 | `test_integration.py` 신규, `indexing.py` 수정 |

---

## 1. AI 모듈 import 경로 연결

### 문제

백엔드에서 AI 모듈(`ReadyQ`)을 불러올 수 없는 상태였음.

`ai/` 폴더에 `__init__.py`가 없고, 내부 파일들이 서로를 `from embedders import ...` 형태로 부르고 있음. `python pipeline.py ...` 로 직접 실행하는 걸 전제로 짜인 구조라, 프로젝트 루트에서 `from ai.pipeline import ReadyQ` 하면 오류 발생.

### 작업 내용

프로젝트 루트에 `ai_engine.py` 신규 파일 1개 생성. `main.py`와 `rag_api.py` 양쪽에서 경로 설정을 반복하지 않도록 다리 역할 파일 하나로 모음.

```python
_AI_DIR = Path(__file__).resolve().parent / "ai"
if str(_AI_DIR) not in sys.path:
    sys.path.insert(0, str(_AI_DIR))

from pipeline import ReadyQ
```

`__file__` 기준 절대경로를 사용해, 서버를 어느 위치에서 실행하든 동작하도록 함.

앞으로 백엔드에서는 `from ai_engine import ReadyQ` 한 줄로 사용.

**변경 파일**: `ai_engine.py` (신규)

---

## 2. 업로드 인덱싱 연결

### 문제

업로드 API가 PDF를 저장만 하고 끝나서, `ReadyQ`가 요구하는 `chunks.jsonl`이 생성되지 않았음. 그 결과 AI 모듈을 띄울 수 없는 상태였음.

```
기존:  PDF 업로드 → 저장 → (끊김) → ReadyQ 생성 불가
수정:  PDF 업로드 → 저장 → 인덱싱 → chunks.jsonl → 품질 판정 → 응답
```

### 작업 내용

`indexing.py` 신규 생성. AI 파트 설계의 두 가지 원칙을 그대로 적용함.

1. **텍스트 0건이면 조용히 넘기지 않고 실패 처리** — 검색이 불가능한 자료를 발표자가 모른 채 발표에 들어가는 것이 가장 위험한 실패 양상이라는 설계를 따름
2. **검색 불가 슬라이드를 품질 판정으로 고지** — `quality_report.py`와 동일 기준 사용 (검색 불가 15% 초과 시 `실패`, 5% 초과 시 `경고`)

`upload_api.py` 수정.

- 업로드 직후 인덱싱 수행
- 인덱싱 실패 시 원본 파일을 삭제하고 HTTP 422로 사유 반환 (쓸 수 없는 자료를 서버에 남기지 않음)
- 응답에 `slides`, `quality` 추가 → **자료 준비 상태 화면에서 "N번 슬라이드는 근거로 못 씁니다" 고지에 사용**
- 자료 삭제 시 청크 파일도 함께 삭제

### 응답 형태 (프론트 참고용)

```json
{
  "status": "success",
  "presentation_id": "3c8b9bb6-...",
  "slides": 14,
  "quality": {
    "verdict": "양호",
    "message": "모든 슬라이드가 근거로 사용 가능합니다.",
    "unsearchable_pages": [],
    "median_letters": 141
  }
}
```

### 작업 중 발견한 보안 이슈

`.gitignore`에 `ai/data/`는 있었으나 루트 `data/`가 누락되어 있었음. **인덱싱 결과물(`chunks.jsonl`)에는 발표자료 원문이 통째로 포함되는데, 레포지토리가 public이라 그대로 두면 타인의 발표자료가 공개될 수 있었음.**

`data/`, `uploaded_files/`를 `.gitignore`에 추가하여 차단함.

> **참고**: `.gitignore`는 줄 끝 주석을 지원하지 않음. `data/ # 설명` 형태로 작성하면 패턴이 깨져 무시되지 않음. 주석은 반드시 별도 줄에 작성해야 함.

**변경 파일**: `indexing.py` (신규), `routers/upload_api.py`, `.gitignore`

---

## 3. `warm()` 백그라운드 처리 + 준비 상태 API

### 문제

`ReadyQ.warm()`은 임베딩 모델을 로딩하고 문서를 색인하는 작업으로 수십 초에서 2분까지 소요됨. 업로드 응답에서 이를 기다릴 경우 요청이 그동안 멈추게 됨.

### 작업 내용

```
업로드 → 인덱싱(2초) → 즉시 응답 + warm 백그라운드 시작
                          ↓
프론트 상태 폴링 → 분석중 → 준비완료 → 질문 시작 버튼 활성화
```

`engine_store.py` 신규 생성.

- 발표별 `ReadyQ` 인스턴스와 준비 상태 보관
- `warm()`은 별도 스레드에서 실행 (모델 로딩·행렬 연산이라 GIL 밖에서 시간을 소비)
- 상태값: `분석중` / `준비완료` / `실패` / `없음` — 프론트가 이 값으로 화면 분기
- 서버 재시작으로 엔진이 사라져도 청크 파일이 남아 있으면 상태 조회 시 자동 재시작

`upload_api.py` 수정.

- 인덱싱 성공 직후 준비 작업 자동 시작
- `GET /api/upload/status/{presentation_id}` 신규 추가 — 준비 상태 화면용 폴링 엔드포인트
- 자료 삭제 시 엔진도 함께 정리

### 상태 응답 형태 (프론트 참고용)

```json
{
  "presentation_id": "408ccad9-...",
  "state": "준비완료",
  "ready": true,
  "warm_sec": 26.7,
  "elapsed_sec": 27.1,
  "preset": "balanced",
  "message": "준비 완료! 질문을 시작할 수 있어요."
}
```

`분석중` 상태에서는 `elapsed_sec`이 실시간으로 갱신됨.

### 준비 시간이 자료 분량에 비례함

| 상황 | 실측 |
|---|---|
| 첫 실행 (임베딩 모델 다운로드 포함) | **221초** |
| 14장짜리 자료 | 27초 |
| 393장짜리 자료 | **118초** |
| 업로드 응답 자체 | 2초 |

AI README의 `62초`는 **문서 289장 + 모델이 이미 캐시된 상태** 기준값이었음.

**프론트엔드 반영 사항**

- `"약 90초 걸립니다"` 같은 **고정 시간 문구는 사용 불가**
- 진행률 표시 또는 경과 시간 표시 방식으로 변경 필요 (상태 API가 `elapsed_sec` 제공)

**시연 대비 필수 사항 (전원)**

- **심사 당일 시연 전에 미리 한 번 업로드하여 임베딩 모델을 캐시시켜 둘 것**
- 캐시되지 않은 상태에서 첫 업로드 시 3분 이상 대기가 발생함

### 검증

준비 완료된 엔진으로 실제 질의 확인.

| 질문 | 결과 |
|---|---|
| "캡스톤디자인 참가 자격이 어떻게 되나요?" | `status=ok`, 근거 3개, 64.7ms |
| "오늘 점심 뭐 먹지?" | `status=no_evidence`, 근거 0개, 0.98ms |

**변경 파일**: `engine_store.py` (신규), `routers/upload_api.py`

---

## 4. WebSocket에 AI 검색 연결

### 작업 내용

`main.py`의 주석 자리를 실제 `cue()` 호출로 채움. 발표자 질문이 실시간으로 AI 검색을 거쳐 화면까지 도달하는 경로가 완성됨.

### 확정된 메시지 계약

AI 파트 README에 정의된 규격을 그대로 구현.

```
C→S  {"type":"session.start", "presentation_id":"..."}   어느 발표인지 지정
C→S  {"type":"stt.final",     "text":"질문"}             발화 종료 → 검색 실행
C→S  {"type":"stt.partial",   "text":"..."}              말하는 중 → 현재 무시

S→C  {"type":"cue.evidence",  status, question_type, keywords[],
                              sources[], advice[], deflect[], latency_ms}
S→C  {"type":"session.ready" | "not_ready" | "error"}
```

### 설계 판단

1. **평문 입력도 수용** — 프론트엔드가 JSON 전환 작업을 하는 동안 기존 데모가 멈추지 않도록 호환 처리 추가
2. **`asyncio.to_thread`로 분리** — `cue()`가 동기 함수라 직접 호출 시 이벤트 루프가 막힘. 동시 접속 시 다른 발표자의 응답까지 지연되는 문제 방지
3. **`not_ready` 명시적 응답** — 자료가 준비되지 않은 상태에서 조용히 넘기면 발표자가 원인을 알 수 없음
4. **`stt.partial` 무시** — 투기적 검색은 별도 작업으로 분리

### 테스트 페이지 갱신 (`templates/index.html`)

새 계약에 맞춰 JSON 송수신으로 전환하고, `status` 값에 따라 화면을 분기하도록 수정. `?pid=...` 파라미터로 발표 자료를 지정해 테스트 가능.

### 검증 — 브라우저 실제 동작 확인

| 입력 | `status` | 화면 출력 |
|---|---|---|
| "캡스톤디자인 참가 자격이 어떻게 되나요?" | `ok` | 유형 배지 + 키워드 6개 + 근거 3개 (AI 31.2ms / 서버 35ms) |
| "음..." | `ignored` | "잡음으로 판단해 검색하지 않았습니다" |
| "오늘 저녁 뭐 먹지?" | `no_evidence` | "근거 자료를 찾지 못했어요" + 우회 화법 3문장 |

**→ 프론트엔드가 설계한 세 가지 화면 분기가 실제 데이터로 동작 가능한 상태가 됨.**

### 작업 중 발견한 환경 이슈

`uvicorn`에 `websockets` 패키지가 설치되어 있지 않으면 `/ws` 엔드포인트가 404로 응답함.

```
WARNING: No supported WebSocket library detected.
INFO:    "GET /ws HTTP/1.1" 404 Not Found
```

코드에는 문제가 없는데 연결만 실패하는 형태라 원인 파악이 어려움. 팀원이 각자 환경을 구성할 때 동일하게 겪게 되므로 `requirements.txt`에 반드시 포함해야 함.

**변경 파일**: `main.py`, `templates/index.html`

---

## 5. 텍스트 폴백 API를 실제 검색으로 교체

### 문제

`/api/rag/fallback/ask`(STT 오류 시 직접 입력 경로)가 AI 처리를 흉내만 내고 있었음.

```python
await asyncio.sleep(1.0)                    # 처리하는 척 1초 대기
if "테스트" in req.question:                 # 낱말 포함 여부로 분기
    answer = "해당 질문은 발표 주제와 무관하거나..."
else:
    answer = f"'{req.question}'에 대한 핵심 방어 논리입니다."
```

### 작업 내용

가짜 응답을 실제 `rq.cue()` 호출로 교체. **음성 경로(WebSocket)와 동일한 함수를 호출하고 동일한 형태로 반환**하도록 통일함.

- 입력 수단만 다를 뿐 결과가 달라지면 안 됨
- 프론트엔드도 렌더링 코드를 하나만 유지하면 됨
- 엔진이 준비되지 않은 경우 HTTP 409 + `not_ready`로 명시

### 검증 — 두 경로 결과 일치 확인

동일한 질문에 대해 `status` / 질문 유형 / 근거 슬라이드 / 키워드가 모두 일치.

```
음성 경로   : status=ok  유형=절차  근거=[2, 1, 6]
텍스트 경로 : status=ok  유형=절차  근거=[2, 1, 6]   → 일치 ✅
준비 안 된 발표 → HTTP 409 not_ready
```

**변경 파일**: `routers/rag_api.py`

> **부수 작업**: `rag_api.py`의 낡은 주석 정리. `"추후 AI 팀원(예진 님)이 ChromaDB에 임베딩하는 로직을 구현할 자리"`라고 되어 있었으나 세 가지가 모두 변경된 상태였음 — ChromaDB 미사용 결정, 인덱싱 구현 완료, 해당 작업은 백엔드 담당.

---

## 6. Q&A 로그 단일화

### 문제 — 이중 기록 발견

같은 질문이 두 군데에 쌓이고 있었음.

| 기록 주체 | 저장 위치 | 읽는 쪽 |
|---|---|---|
| AI (`ReadyQ`가 자동 기록) | `data/qa_log.jsonl` | 회고 리포트 (`ai/report.py`) |
| 백엔드 (`save_qa_log`) | `qa_logs.json` | 이전 질문 목록 화면 |

두 파일의 내용이 어긋나면 **회고 리포트와 이전 질문 목록이 서로 다른 데이터를 보여주게 됨.**

> 5번 작업과 엮여 있어 함께 처리함. 가짜 응답을 제거하면 `save_qa_log(answer=...)`에 넘길 값이 사라지는데, Ready-Q는 애초에 완성된 답변을 생성하지 않으므로 채울 수 있는 진짜 값이 없음. 5번만 처리하고 멈출 경우 텍스트 입력 질문이 아예 기록되지 않는 상태가 됨.

### 작업 내용

**AI 로그를 단일 출처로 채택.** 담고 있는 정보가 더 많음.

| | 백엔드 로그 | AI 로그 |
|---|---|---|
| 필드 | timestamp, question, answer, status | at, session, question, **qtype, status, latency_ms, slides, keywords, weak_type, expected_hit** |

백엔드 로그에만 있던 `answer` 필드는 **Ready-Q가 생성하지 않는 값임.** 완성된 답변을 대신 작성하지 않는 것이 이 제품의 설계 원칙이므로, 해당 필드를 유지하려면 없는 값을 지어내야 함.

`log_api.py`를 저장 기능 제거 후 조회 전용으로 재작성.

| 엔드포인트 | 용도 |
|---|---|
| `GET /api/logs/{id}` | 이전 질문 목록 화면 |
| `GET /api/logs/{id}/summary` | **회고 리포트 집계 (신규)** |

### 회고 리포트 집계 응답

```json
{
  "total": 4,               // 총 질문 수
  "answered": 3,            // 근거를 찾은 질문
  "no_evidence": 1,         // 근거 없음
  "ignored": 0,             // 잡음으로 걸러짐
  "avg_latency_ms": 30.5,   // 평균 응답 시간
  "expected_hit_rate": 0.0, // 예상 질문 적중률
  "by_type": {"절차": 2, "사실확인": 2}
}
```

**→ 프론트엔드 회고 리포트 화면의 상단 3개 지표(총 질문 수 / 예상 질문 적중률 / 평균 응답 시간)가 이 API에서 그대로 나옴.**

**→ `by_type`은 이전에 "회고 리포트에 유형별 분석이 없다"고 지적했던 항목의 재료가 됨** (WBS 3.1.13 질문 유형별 취약점).

**변경 파일**: `routers/log_api.py`

---

## 7. `requirements.txt` 작성 및 환경 구성 이슈 수정

### 작업 내용

프로젝트 루트에 `requirements.txt` 신규 생성. 맨 위에서 `-r ai/requirements.txt`로 AI 의존성까지 끌어와, **한 줄로 전체 환경이 구성되도록** 함.

```bash
pip install -r requirements.txt
```

파트별로 따로 설치하면 버전이 갈려 "내 컴퓨터에선 되는데" 상황이 발생하므로 하나로 통합.

| 패키지 | 없을 때 증상 |
|---|---|
| `websockets` | 코드는 정상인데 **`/ws`만 404**로 응답 |
| `python-multipart` | **업로드 API가 500**으로 실패 |

앞의 두 개는 **"코드는 멀쩡한데 특정 기능만 조용히 실패"하는 유형**이라, 나중에 누가 지우지 않도록 주석으로 이유를 함께 기록함.

### 발견한 버그

`ai/requirements.txt` 마지막 줄 때문에 **파일 전체 설치가 실패함.**

```
ERROR: Could not find a version that satisfies the requirement pywin32==308
ERROR: No matching distribution found for pywin32==308
```

**원인**: Python 3.14에는 `pywin32` 308 배포본이 존재하지 않음 (311, 312만 있음). 이예진 님 환경(3.12 또는 3.13 추정)에는 308이 있어 드러나지 않았던 문제.

**영향**: 파이썬 버전이 다른 팀원은 `pip install -r ai/requirements.txt`가 통째로 실패해 환경 구성 자체가 막힘.

**조치**: `pywin32==308` → `pywin32>=308`로 완화. 윈도우에서 PPTX를 이미지로 내보낼 때만 사용하는 **선택적 의존성**이므로 정확히 고정할 이유가 없음.

> **참고**: 선택적·OS 전용 의존성을 `==`로 고정하면 그 한 줄 때문에 전체 설치가 막힘. 하한(`>=`)만 두는 것이 안전함.

### 검증 (Python 3.14.7)

수정 후 전체 명세 해석 성공.

```
Would install  PyMuPDF-1.27.2.3  numpy-2.2.2  torch-2.13.0
               transformers-4.53.2  sentence-transformers-5.0.0
               langgraph-1.2.9  google-genai-2.22.0  openai-2.45.0
               pywin32-312
```

**"설치 가능"까지만 확인했고, "고정 버전으로 설치해도 동일하게 동작한다"는 미검증 상태.** 관문 1 전에 새 가상환경에 고정 버전으로 설치하여 재확인 필요.

**변경 파일**: `requirements.txt` (신규), `ai/requirements.txt`

---

## 8. 통합 테스트 작성

### 작업 내용

`test_integration.py` 신규 생성. 서버를 따로 띄우지 않고 전 구간을 자동 검증함.

```bash
python test_integration.py <텍스트가_들어있는.pdf>
```

업로드 → 인덱싱 → 준비 → 질문(음성/텍스트) → 로그 → 삭제까지 **37개 항목** 검증.

### 발견한 버그 — 손상된 PDF 업로드 시 서버가 죽음

```
pymupdf.FileDataError: Failed to open file '...' as type pdf
```

`indexing.py`가 `NoTextError`와 `ValueError`만 잡고 있었고, **PyMuPDF가 파일을 아예 열지 못하는 경우**(`FileDataError`)는 처리되지 않았음.

**피해**

1. 사용자에게 500이 나감 — 무엇이 잘못됐는지 알 수 없음
2. 예외가 `os.remove()` 앞에서 발생해 **못 쓰는 파일이 서버에 계속 쌓임**

**조치**: 파일 열기 실패를 `unreadable`로 처리. 이제 422 + 사유로 응답하고 업로드된 파일도 정리됨.

### 테스트 결과

```
[0] 모듈 import                    1/1
[1] 업로드 입력 검증                2/2
[2] 업로드 → 인덱싱                 5/5
[3] 준비 상태 폴링                  3/3   (warm 47.8초)
[4] WebSocket                      9/9
[5] 텍스트 폴백                     4/4
[6] 로그 / 회고 집계                5/5
[7] 기타 API                       3/3
[8] 삭제 정리                       3/3
──────────────────────────────────────
통과 37 / 실패 0
```

**변경 파일**: `test_integration.py` (신규), `indexing.py`

---

## 전체 변경 요약

**12개 파일 — 신규 5개 / 수정 7개 (+703줄 / −117줄)**

### 신규 (5개)

| 파일 | 줄 수 | 역할 |
|---|---|---|
| `ai_engine.py` | 20 | AI 모듈 import 다리 |
| `indexing.py` | 101 | 업로드 자료 → 검색용 청크 생성 + 품질 판정 |
| `engine_store.py` | 101 | 발표별 엔진 보관 + 준비 상태 관리 |
| `requirements.txt` | 23 | 전체 환경 구성 |
| `test_integration.py` | 197 | 통합 테스트 37개 |

### 수정 (7개)

| 파일 | 변경량 |
|---|---|
| `main.py` | +83 / −15 |
| `routers/log_api.py` | 전면 재작성 (101줄) |
| `routers/rag_api.py` | +33 / −43 |
| `routers/upload_api.py` | +51 |
| `templates/index.html` | +58 |
| `.gitignore` | +4 |
| `ai/requirements.txt` | +4 / −1 |

### 신규 API 엔드포인트

| 메서드 | 경로 | 용도 |
|---|---|---|
| `GET` | `/api/upload/status/{id}` | 자료 준비 상태 폴링 |
| `GET` | `/api/logs/{id}/summary` | 회고 리포트 집계 |

### 동작이 바뀐 엔드포인트

| 경로 | 변경 내용 |
|---|---|
| `POST /api/upload/pdf` | 응답에 `slides`·`quality`·`state` 추가. 인덱싱 실패 시 422 |
| `POST /api/rag/fallback/ask` | 실제 검색 결과 반환 (음성 경로와 동일 형태). 미준비 시 409 |
| `GET /api/logs/{id}` | AI 로그 기반으로 변경 |
| `WS /ws` | JSON 계약 적용, 실제 근거 검색 결과 전송 |

---

## 파트별 전달 사항

### 민서정 (백엔드)

- `main.py` WebSocket, `rag_api.py`, `upload_api.py`, `log_api.py`를 수정함. PR에서 확인 요청
- `fallback/ask`의 `asyncio.sleep(1.0)` 가짜 응답을 실제 검색으로 교체함
- 다음 작업(투기적 검색, STT 2종 비교)은 이 위에서 진행하면 됨

### 이예진 (AI)

- ⚠️ `ai/requirements.txt`의 `pywin32==308` 때문에 **Python 3.14에서 설치가 통째로 실패.** `>=308`로 수정함
- `cue()`를 백엔드가 실제로 호출하고 있어, `Cue` 필드 변경 시 백엔드·프론트에 즉시 영향. 변경 시 공유 요청

### 박서연 (프론트)

화면 구현에 필요한 API가 모두 열림.

- `GET /api/upload/status/{id}` — 자료 준비 상태 (`분석중`/`준비완료`/`실패`)
- `GET /api/logs/{id}/summary` — 회고 리포트 3개 지표 + 유형별 분포
- `WS /ws` — `status`가 `ok`/`ignored`/`no_evidence`로 전달되어 화면 분기 가능

`templates/index.html`에 실제 동작하는 예시 구현이 있음.

---

## 재현 방법

```bash
git clone -b feature/integration https://github.com/VibeByeBug/vibebyebug.git
pip install -r requirements.txt
python test_integration.py 발표자료.pdf
```

37개 테스트가 모두 통과하면 연결이 정상 동작하는 것.
