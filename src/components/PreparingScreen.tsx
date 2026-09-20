import { useEffect, useState } from 'react';
import { fetchModelReady, fetchStatus } from '../api';
import type { PreparingStatus } from '../types/flow';
import { WarningIcon } from './icons';

const STEPS: { key: PreparingStatus; label: string }[] = [
  { key: 'uploading', label: '자료 인덱싱' },
  { key: 'analyzing', label: 'AI 모델 로딩' },
  { key: 'ready', label: '실시간 연결 준비' },
];

// 남은 시간 어림값. 진행률 막대와 "약 N초 남음" 에만 쓴다(실제 진행이 아니다).
// 임베딩 모델을 이미 올려둔 서버는 색인만 하면 되므로 훨씬 짧다.
//   측정(2026-09-20): 모델 올라와 있으면 16~20초, 서버를 막 켰으면 79초.
const EXPECTED_WARM_SEC = 20;
const EXPECTED_COLD_SEC = 80;

interface PreparingScreenProps {
  presentationId: string;
  onReady: () => void;
  onRetry: () => void;
}

export function PreparingScreen({ presentationId, onReady, onRetry }: PreparingScreenProps) {
  // 자료 인덱싱은 업로드 때 끝났으므로 모델 로딩부터 시작한다
  const [status, setStatus] = useState<PreparingStatus>('analyzing');
  const [progress, setProgress] = useState(8);
  const [expected, setExpected] = useState(EXPECTED_COLD_SEC);
  const [slow, setSlow] = useState(false); // 어림값을 넘겼다. 남은 시간을 세지 않는다.

  useEffect(() => {
    let stop = false;
    async function poll() {
      // 모델이 이미 올라와 있으면 금방 끝난다. 90초를 세면서 기다리게 하면 안 된다.
      const ready = await fetchModelReady();
      if (!stop && ready) setExpected(EXPECTED_WARM_SEC);
      while (!stop) {
        try {
          const st = await fetchStatus(presentationId);
          if (st.state === '준비완료') return setStatus('ready');
          if (st.state === '실패' || st.state === '없음') return setStatus('failed');
          const sec = st.elapsed_sec ?? 0;
          setProgress(Math.min(96, 8 + (sec / (ready ? EXPECTED_WARM_SEC : EXPECTED_COLD_SEC)) * 88));
          setSlow(sec > (ready ? EXPECTED_WARM_SEC : EXPECTED_COLD_SEC));
        } catch {
          return setStatus('failed');
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [presentationId]);

  useEffect(() => {
    if (status === 'ready') {
      const t = setTimeout(onReady, 500);
      return () => clearTimeout(t);
    }
  }, [status, onReady]);

  const activeIndex = STEPS.findIndex((step) => step.key === status);
  const displayProgress = status === 'ready' ? 100 : progress;
  const secondsLeft = Math.max(0, Math.round(((100 - displayProgress) / 88) * expected));

  return (
    <div className="flex flex-1 items-center justify-center py-[44px] w-full">
      {status === 'failed' ? (
        <div className="flex flex-col items-center gap-[16px] w-[420px] text-center">
          <span className="size-[52px] text-[#bf382e]">
            <WarningIcon />
          </span>
          <p className="text-[15px] text-[#6b7280]">자료 준비 중 오류가 발생했어요. 다시 시도해주세요.</p>
          <button
            type="button"
            onClick={onRetry}
            className="bg-[#f26b1d] rounded-[6px] px-[20px] py-[12px] text-[15px] font-bold text-white"
          >
            재시도
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[48px] items-center w-full max-w-[880px] px-[16px]">
          <div className="flex flex-col gap-[7px] items-center text-center w-full">
            <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px]">
              AI가 발표를 준비하고 있어요
            </p>
            <p className="font-normal text-[15px] text-[#808080]">잠시만 기다려주세요</p>
          </div>

          <div
            className="flex items-center justify-center rounded-full shrink-0 size-[160px]"
            style={{ background: `conic-gradient(#f26b1d ${displayProgress * 3.6}deg, #e6e6e6 0deg)` }}
          >
            <div className="bg-white flex flex-col items-center justify-center rounded-full size-[140px]">
              <p className="font-bold text-[30px] text-black">{Math.round(displayProgress)}%</p>
              <p className="font-normal text-[12px] text-[#808080]">
                {slow ? '거의 다 됐어요' : `약 ${secondsLeft}초 남음`}
              </p>
            </div>
          </div>

          <div className="bg-[#f2f2f2] flex flex-col gap-[16px] px-[27px] py-[24px] rounded-[12px] w-[560px]">
            {STEPS.map((step, index) => {
              const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
              return (
                <div key={step.key} className="flex items-center justify-between w-full">
                  <div className="flex gap-[10px] items-center">
                    <span
                      className={`flex items-center justify-center rounded-full shrink-0 size-[22px] text-[12px] font-bold ${
                        state === 'done'
                          ? 'bg-[#409959] text-white'
                          : state === 'active'
                            ? 'bg-[#fff0de] text-[#f57321]'
                            : 'bg-[#e6e6e6] text-[#f57321]'
                      }`}
                    >
                      {state === 'done' ? '✓' : state === 'active' ? '···' : ''}
                    </span>
                    <p className={`text-[14px] ${state === 'done' ? 'font-bold' : 'font-medium'} text-[#262626]`}>
                      {step.label}
                    </p>
                  </div>
                  <p
                    className={`text-[13px] ${
                      state === 'done' ? 'text-[#409959]' : state === 'active' ? 'text-[#f57321]' : 'text-[#808080]'
                    }`}
                  >
                    {state === 'done' ? '완료' : state === 'active' ? '진행 중' : '대기'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
