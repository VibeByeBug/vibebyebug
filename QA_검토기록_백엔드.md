# 1차 QA 검토 기록

1차 QA 작성 : 2026-09-05


| 검토 대상 |
| 백엔드 (민서정) | `feature/backend` | `845ca63` feat: 1차 백엔드 파이프라인 및 라우터 구축 | 2026-09-05 |
| AI (이예진) | `feature/ai` | `7ee08c1` chore(ai): 데모용 스크립트 제거 | 2026-09-05 |
| 프론트 (박서연) | `feature/frontend` | 미검토 | — |

---


## 1. 백엔드 검토 결과 

### ①. Gemini SDK가 갈려 있음

| | 패키지 | 상태 |
|---|---|---|
| 백엔드 `main.py:5` | `google.generativeai` | **지원 종료** |
| AI | `google.genai` | 현행 |

서버 실행 시 실제로 경고가 뜨는 것을 확인함.

```
FutureWarning: All support for the `google.generativeai` package has ended.
Please switch to the `google.genai` package as soon as possible.
```

브랜치를 합칠 때 의존성이 부딪힘. 이예진 님이 이미 신규 SDK를 쓰고 있으니
**백엔드가 `google.genai`로 옮기는 방향**이 좋음.

### ② STT 지연 측정

전체 예산 : 1,000ms  
이 예산을 STT가 먼저 쓰고, 남은 걸 AI가 씀.

```
[발표자가 말을 끝냄] ──?ms──> [STT 최종 텍스트 도착] ──169~2215ms──> [화면에 근거 표시]
                        ↑                                    ↑
                    이 값을 모름                      AI가 실측해둔 값
```

예진짱이 준비한 검색기 선택지 :
프리셋 정의 — pipeline.py:68
성능 수치 — pipeline.py:63

| 프리셋 | 정확도(R@3) | p95 지연 |
|---|---|---|
| `fast` | 80.0% | 1.2ms |
| `balanced` | 88.9% | **428ms** |
| `accurate` | 93.3% | **2,215ms** |

- STT가 **400ms**면 → 남는 600ms → `accurate`(2,215ms)는 탈락, `balanced` 여유 있음
- STT가 **800ms**면 → 남는 200ms → `balanced`(428ms)도 **초과**. `fast`로 내려가야 함


#### 
측정해본 결과 (n=13)
n=13  p50=845ms  p95=1199ms  max=1199ms

**측정 조건**

| 항목 | 내용 |
|---|---|
| 코드 | `qa/latency-measure` 브랜치 · `templates/index.html` |
| 측정 방식 | 마지막 interim 도착 → final 도착 간격 (`performance.now()`) |
| 표본 | 케이스북 질문 10개 1회 낭독 → 실제 측정 13건 |
| 환경 | Web Speech API (크롬) · `ko-KR` · `continuous=true` |

#### 예산 1,000ms에 대입한 결과

| 시나리오 | STT | + 검색 | 합계 | 판정 |
|---|---|---|---|---|
| p50 + `fast` | 845 | 0.7 | **846ms** | 통과 |
| p50 + `balanced` | 845 | 169 | **1,014ms** | 초과 |
| p50 + `accurate` | 845 | 584 | 1,429ms | 초과 |
| p95 + `fast` | 1,199 | 1.2 | **1,200ms** | 초과 |
| p95 + `balanced` | 1,199 | 428 | 1,627ms | 초과 |
| p95 + `accurate` | 1,199 | 2,215 | 3,414ms | 초과 |

**STT 혼자서 예산의 85%(p50) ~ 120%(p95)를 씁니다.**

#### 결론 1 
지금 백엔드 구조(STT 완료 → 그다음 검색)를 그대로 두면 1000ms 목표가 성립 안 함.

#### 결론 2 — 투기적 검색을 하면 `balanced` 사용 가능
845ms의 정체는 **침묵 대기 시간**입니다. 발표자가 말을 멈춘 뒤 브라우저가 진짜 말이 끝났나 확인하는 시간임.

```
발표자 마지막 단어
   │
   ├─ interim 도착 → [여기서 검색 시작] ──169ms──> 검색 완료
   │
   └─ 845ms 침묵 대기 ……………………………→ final 도착
                                            └→ 준비된 결과 즉시 표시 (≈0ms)
```

---

## 코드 보수 
** 3곳 변경, 로직은 기존 코드와 동일 **

1. interimResults = false → true
   지연 측정 위해선 true로 변경 필요.

2. onresult 에 중간/최종 분기 추가
   - 중간 결과: 도착 시각만 기록하고 return (화면은 안 건드림)
   - 최종 결과: (지금 시각 - 마지막 중간 결과 시각) = STT 지연, 콘솔에 출력

3. report() 함수 신규 추가
   브라우저 콘솔에서 report() 치면 p50/p95/max 출력.
   측정 전용이라 기존 흐름과 무관합니다.

---