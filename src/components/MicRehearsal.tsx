import { useRef, useState } from 'react';
import { useMicLevel } from '../hooks/useMicLevel';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

// 마이크 점검(리허설). 실제로 강의실 뒤쪽까지 가서 말해보고, 음량 막대와 인식된 글자로
// "이 거리에서 잡히는지"를 시연 전에 눈으로 확인한다. "민감도 설정"은 Web Speech API 가
// 그런 값을 안 내줘서 못 만들었지만, 이건 그 대신 실제로 되는지 미리 재보는 도구다.
//
// 음량 막대(useMicLevel)와 인식 글자(useSpeechRecognition)는 서로 다른 두 경로를 각각 새로
// 연다 - 실전에서 쓰는 인식 흐름과는 완전히 분리돼 있어서, 여기서 뭘 해도 실전에는 영향이 없다.
export function MicRehearsal() {
  const [active, setActive] = useState(false);
  const { level, error: levelError } = useMicLevel(active);
  const [heard, setHeard] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);

  const { start, stop } = useSpeechRecognition({
    onPartialResult: (t) => setHeard(t),
    onFinalResult: (t) => {
      setHeard(t);
      // 다음 말을 시작하면 이전 문장이 계속 남아 헷갈리지 않게, 잠깐 보여주고 비운다
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setHeard(''), 3000);
    },
    onError: () => setRecError('음성 인식을 시작하지 못했어요. 마이크 권한을 확인해주세요'),
  });

  function toggle() {
    if (active) {
      stop();
      setActive(false);
      setRecError(null); // 꺼진 뒤에는 지난 오류 문구를 남기지 않는다
    } else {
      setHeard('');
      setRecError(null);
      setActive(true);
      start();
    }
  }

  const error = levelError ?? recError;
  // 막대 색: 너무 작으면(안 들림) 흐리게, 적당하면 초록, 너무 크면(뻥 뚫려 왜곡) 주황으로 경고
  const barColor = level < 15 ? 'bg-ink/25' : level > 92 ? 'bg-warn' : 'bg-ok';

  return (
    <div className="flex flex-col gap-[10px] w-full max-w-[420px]">
      <button
        type="button"
        onClick={toggle}
        className={`self-start h-[34px] px-[14px] rounded-[8px] font-bold text-[13px] transition-colors ${
          active ? 'bg-[#f26b1d] text-white' : 'border border-ink/20 text-ink/75 hover:border-ink/45'
        }`}
      >
        {active ? '점검 마치기' : '점검 시작'}
      </button>

      {active && !error && (
        <div className="flex flex-col gap-[8px]">
          <div className="h-[8px] w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${barColor}`}
              style={{ width: `${level}%` }}
            />
          </div>
          <p className="min-h-[20px] font-medium text-[13px] text-ink/70 break-keep">
            {heard || '질문자 자리로 가서 실제 질문하듯 말해보세요···'}
          </p>
        </div>
      )}

      {error && <p className="font-medium text-[13px] text-err break-keep">{error}</p>}
    </div>
  );
}
