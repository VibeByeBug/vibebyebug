# 측정 코드

QA 측정에 실제로 사용한 코드 사본. **참고용이며 이 브랜치에서 실행되지 않습니다.**

원본 : `feature/backend` (`845ca63`) 의 `templates/index.html`

> 측정용으로 쓰던 `qa/latency-measure` 브랜치는 정리했음.
> 이 폴더의 `index.html` 이 그 코드의 유일한 사본임.

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

## 원본과의 차이 (전문)

`feature/backend` 의 `templates/index.html` 대비 바뀐 부분 전부.

### 1. 중간 결과 켜기

```diff
- recognition.interimResults = false;
+ recognition.interimResults = true;
```

### 2. `onresult` — 중간/최종 분기 + 지연 기록

```diff
+ var lastInterimAt = null;                // 마지막으로 말이 들어온 시각
+ var lags = [];                           // 측정값 모으는 곳
+
  recognition.onresult = function(event) {
-     var transcript = event.results[event.results.length - 1][0].transcript;
-     recognizedBox.innerHTML += transcript + "<br>";
-     ws.send(transcript);
+     var now = performance.now();
+     var result = event.results[event.results.length - 1];
+     var transcript = result[0].transcript;
+
+     if (!result.isFinal) {
+         // 중간 결과: 시각만 기록하고 화면은 건드리지 않는다 (원본 동작 유지)
+         lastInterimAt = now;
+         return;
+     }
+
+     // 최종 결과: 여기까지 걸린 시간이 STT 지연
+     var sttLagMs = lastInterimAt ? Math.round(now - lastInterimAt) : null;
+     if (sttLagMs !== null) lags.push(sttLagMs);
+     console.log("STT 지연:", sttLagMs, "ms  |  누적", lags.length, "건");
+
+     recognizedBox.innerHTML += transcript + "<br>";   // 원본 그대로
+     ws.send(transcript);                              // 서버 계약도 그대로
+     lastInterimAt = null;
  };
```

### 3. `report()` 추가 — 콘솔 전용

```diff
+ function report() {
+     if (lags.length === 0) { console.log("측정된 값이 없습니다."); return; }
+     var s = lags.slice().sort(function(a, b) { return a - b; });
+     var q = function(p) { return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
+     console.log("n=" + s.length + "  p50=" + q(0.5) + "ms  p95=" + q(0.95) + "ms  max=" + s[s.length - 1] + "ms");
+ }
```

**안 바뀐 것** : `recognizedBox.innerHTML +=` 누적 방식, `ws.send(transcript)` 평문 전송,
`continuous`, `lang`, `toggleRecording()`, HTML·CSS 전부.

## 관련 문서

- 측정 결과와 해석 : `../QA_검토기록_백엔드.md`
