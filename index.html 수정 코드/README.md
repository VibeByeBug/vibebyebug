# 측정 코드

QA 측정에 실제로 사용한 코드 사본. **참고용이며 이 브랜치에서 실행되지 않습니다.**

원본 위치 : `qa/latency-measure` 브랜치의 `templates/index.html`

## index.html — STT 지연 측정

`feature/backend`(`845ca63`)의 `templates/index.html`에 **기록하는 코드 3가지**만 추가한 것.
화면 동작과 서버 전송 형식은 원본과 동일하므로 `main.py` 수정 없이 그대로 돌아감.

| # | 변경 |
|---|---|
| 1 | `interimResults` `false` → `true` |
| 2 | `onresult` 에 중간/최종 분기 + 지연 시각 기록 |
| 3 | `report()` 추가 (브라우저 콘솔 전용) |

### 쓰는 법

1. 서버 실행 후 `http://localhost:8000` 접속
2. `F12` → Console 탭
3. 마이크 켜고 질문을 **하나씩** 낭독 (질문 사이 2~3초 침묵 필요)
4. 콘솔에 `report()` 입력

```
n=13  p50=845ms  p95=1199ms  max=1199ms
```

화면에 인식된 질문이 누적되므로 **줄 수를 세면 질문 쪼개짐을 확인**할 수 있음.
(측정 13건 중 3건이 장황한 질문이 중간에 끊긴 것)

## 관련 문서

- 측정 결과와 해석 : `../QA_검토기록_백엔드.md`
- 원본과의 차이 비교 :
  https://github.com/VibeByeBug/vibebyebug/compare/feature/backend...qa/latency-measure
