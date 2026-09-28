import { useEffect, useState } from 'react';

// 마이크 점검(리허설)용 실시간 음량. 0~100 으로 정규화한다.
// 실전 음성 인식(useSpeechRecognition, Web Speech API)과는 완전히 별개의 경로다 - 여기서 마이크를
// 직접 열어 소리 크기만 잰다. 그래서 이 값을 아무리 봐도 실전 인식 동작에는 영향이 없다.
// (Web Speech API 는 이런 값을 내주지 않는다 - 이게 "민감도 조절"을 못 만드는 이유이기도 하다.)
export function useMicLevel(active: boolean) {
  const [level, setLevel] = useState(0); // 0~100
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      setError(null);
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let stopped = false;
    let lastSet = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.65; // 순간 튐을 줄여서 막대가 덜 파르르 떤다
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        const tick = (now: number) => {
          analyser.getByteTimeDomainData(data);
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / data.length);
          const db = 20 * Math.log10(rms || 0.00001);
          // 조용한 방 소음(-60dB 안팎)을 0, 가까이서 또렷이 말하는 소리(-10dB 안팎)를 100 으로 둔다.
          const pct = Math.max(0, Math.min(100, ((db + 60) / 50) * 100));
          // 60fps 로 그대로 렌더하면 리렌더가 잦다. 8프레임(~130ms)에 한 번만 올린다.
          if (now - lastSet > 130) {
            setLevel(Math.round(pct));
            lastSet = now;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError(
          e instanceof Error && e.name === 'NotAllowedError'
            ? '마이크 권한이 거부됐어요. 주소창 왼쪽 자물쇠에서 허용해주세요'
            : '마이크를 열 수 없어요',
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [active]);

  return { level, error };
}
