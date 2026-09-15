import { useEffect, useState } from 'react';
import type { PreparingStatus } from '../types/flow';

const STEPS: { key: PreparingStatus; label: string }[] = [
  { key: 'uploading', label: '업로드중' },
  { key: 'analyzing', label: '분석중' },
  { key: 'ready', label: '준비완료' },
];

interface PreparingScreenProps {
  initialStatus?: PreparingStatus;
  onReady: () => void;
  onRetry: () => void;
}

export function PreparingScreen({ initialStatus = 'uploading', onReady, onRetry }: PreparingScreenProps) {
  const [status, setStatus] = useState<PreparingStatus>(initialStatus);

  useEffect(() => {
    if (initialStatus === 'failed' || initialStatus === 'ready') return;

    const toAnalyzing = setTimeout(() => setStatus('analyzing'), 2000);
    const toReady = setTimeout(() => setStatus('ready'), 4000);
    return () => {
      clearTimeout(toAnalyzing);
      clearTimeout(toReady);
    };
  }, [initialStatus]);

  const activeIndex = STEPS.findIndex((step) => step.key === status);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 rounded-2xl bg-white p-8 shadow-lg">
      {status === 'failed' ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl font-bold text-red-500">
            !
          </div>
          <p className="text-center text-sm text-gray-600">자료 준비 중 오류가 발생했어요. 다시 시도해주세요.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            재시도
          </button>
        </>
      ) : (
        <>
          <div className="flex w-full items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.key} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    index <= activeIndex ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {index + 1}
                </div>
                <span
                  className={`text-xs ${index === activeIndex ? 'font-semibold text-orange-600' : 'text-gray-400'}`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onReady}
            disabled={status !== 'ready'}
            className="w-full rounded-lg bg-[#4D4D4D] px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 enabled:hover:bg-gray-700"
          >
            질문 시작하기
          </button>
        </>
      )}
    </div>
  );
}
