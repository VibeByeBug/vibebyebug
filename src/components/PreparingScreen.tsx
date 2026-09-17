import { useEffect, useState } from 'react';
import type { PreparingStatus } from '../types/flow';

const STEPS: { key: PreparingStatus; label: string }[] = [
  { key: 'uploading', label: '자료 인덱싱' },
  { key: 'analyzing', label: 'AI 모델 로딩' },
  { key: 'ready', label: '실시간 연결 준비' },
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
  const progress = status === 'failed' ? 0 : ((activeIndex + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-10 rounded-2xl bg-white p-8 shadow-lg">
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
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">AI가 발표를 준비하고 있어요</h1>
            <p className="mt-1 text-sm text-gray-500">잠시만 기다려주세요</p>
          </div>

          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#F26B1D ${progress * 3.6}deg, #FBE1CC ${progress * 3.6}deg)` }}
          >
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
              <span className="text-2xl font-black text-gray-900">{Math.round(progress)}%</span>
              <span className="mt-1 text-xs text-gray-400">
                약 {Math.max(0, (STEPS.length - 1 - activeIndex) * 2)}초 남음
              </span>
            </div>
          </div>

          <div className="w-full space-y-3">
            {STEPS.map((step, index) => (
              <div key={step.key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{step.label}</span>
                <span
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    index < activeIndex
                      ? 'text-green-600'
                      : index === activeIndex
                        ? 'text-orange-500'
                        : 'text-gray-400'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      index < activeIndex ? 'bg-green-500' : index === activeIndex ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  />
                  {index < activeIndex ? '완료' : index === activeIndex ? '진행 중' : '대기'}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onReady}
            disabled={status !== 'ready'}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 enabled:hover:bg-orange-600"
          >
            질문 시작하기
          </button>
        </>
      )}
    </div>
  );
}
