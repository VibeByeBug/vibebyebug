import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ArrowLeftIcon, ArrowRightIcon, MicSmallIcon } from './icons';
import type { QuestionType } from '../types/mockPractice';

// 모의 연습: 발표자료로 만든 예상 질문에 답해보고, 근거를 얼마나 담았는지 본다.
// 질문은 서버가 발표자료에서 만든다(유형마다 모델 호출 1회, 1분 안팎). 한 번 만들면 저장해 두고 다시 쓴다.
// 판정은 모델을 부르지 않는다. 근거 줄의 수치와 핵심어가 답변에 나왔는지 대조한다.

interface PracticeQuestion {
  question: string;
  type: QuestionType | string;
  page: number;
  facts: string[];
  snippet: string;
  followup?: string;
}

interface Judgement {
  ratio: number;
  facts: string[];
  covered: string[];
  missed: string[];
  snippet: string;
  elsewhere: string[];
}

interface MockPracticeScreenProps {
  presentationId: string;
  onFinish: () => void;
  onIndexChange?: (index: number, total: number) => void;
}

export function MockPracticeScreen({ presentationId, onFinish, onIndexChange }: MockPracticeScreenProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [judged, setJudged] = useState<Judgement | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setQuestions(null);
    try {
      const res = await fetch(`${API_URL}/api/practice/${presentationId}/questions`);
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '예상 질문을 불러오지 못했습니다');
      setQuestions(data.questions as PracticeQuestion[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '예상 질문을 불러오지 못했습니다');
    }
  }, [presentationId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = questions?.length ?? 0;
  const question = questions?.[index];
  const isLast = index === total - 1;

  useEffect(() => {
    onIndexChange?.(index, total);
  }, [index, total, onIndexChange]);

  // 말로 연습하기. 받아 적은 말은 답변 칸에 이어 붙는다.
  const appendRef = useRef((t: string) => setAnswer((prev) => (prev ? `${prev} ${t}` : t)));
  const { start, stop, listening } = useSpeechRecognition({
    onPartialResult: () => {},
    onFinalResult: (t) => appendRef.current(t),
    onError: () => {},
  });

  function goTo(next: number) {
    stop();
    setIndex(Math.max(0, Math.min(total - 1, next)));
    setAnswer('');
    setJudged(null);
  }

  async function judge() {
    if (!question) return;
    stop();
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/practice/${presentationId}/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.question, page: question.page, answer }),
      });
      const data = await res.json();
      if (res.ok) setJudged(data as Judgement);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col gap-[14px] items-center justify-center px-[24px] py-[60px] text-center">
        <p className="font-bold text-[20px] text-white break-keep">{loadError}</p>
        <p className="font-medium text-[14px] text-white/50 break-keep">
          발표 준비(모델 로딩)가 끝난 뒤에 예상 질문을 만들 수 있어요.
        </p>
        <div className="flex gap-[8px]">
          <button type="button" onClick={load} className="cta h-[42px] px-[20px] rounded-[8px] bg-[#f26b1d] font-bold text-[15px] text-white">
            다시 시도
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="h-[42px] px-[20px] rounded-[8px] border border-white/20 font-bold text-[15px] text-white/75"
          >
            건너뛰기
          </button>
        </div>
      </div>
    );
  }

  if (!questions || !question) {
    return (
      <div className="flex flex-1 flex-col gap-[10px] items-center justify-center px-[24px] py-[60px] text-center">
        <p className="font-bold text-[20px] text-white">발표자료에서 예상 질문을 만들고 있어요···</p>
        <p className="font-medium text-[14px] text-white/50">처음 한 번만 1분 안팎 걸려요. 만든 질문은 저장해 둡니다.</p>
      </div>
    );
  }

  const ratio = judged ? Math.round(judged.ratio * 100) : 0;

  return (
    <div className="flex flex-1 items-start justify-center py-[38px] px-[16px] w-full">
      <div className="flex flex-col gap-[22px] w-full max-w-[980px]">
        <div className="flex flex-col gap-[12px] w-full">
          <div className="flex gap-[10px] items-center justify-center w-full">
            <span className="border border-white/20 px-[11px] py-[5px] rounded-[6px]">
              <span className="font-bold text-[12px] text-white whitespace-nowrap">{question.type}</span>
            </span>
            <p className="font-medium text-[12px] text-white/50 whitespace-nowrap">
              예상 질문 {index + 1} / {total}, 출제 근거 p.{question.page}
            </p>
          </div>
          <p className="font-black text-[30px] text-white tracking-[-0.8px] leading-[40px] w-full text-center break-keep">
            {question.question}
          </p>
        </div>

        <div className="flex flex-col gap-[9px] w-full">
          <p className="font-bold text-[13px] text-white/55 w-full">내 답변</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="border border-white/12 bg-[#1c1713] min-h-[124px] px-[20px] py-[18px] rounded-[8px] text-[17px] text-white outline-none w-full resize-y leading-[29px] placeholder:text-white/30"
            placeholder="실제 발표하듯 답해보세요"
          />
          <div className="flex flex-wrap gap-[10px] items-center justify-between w-full">
            <button
              type="button"
              onClick={() => (listening ? stop() : start())}
              className={`flex gap-[8px] h-[36px] items-center px-[14px] rounded-[8px] font-bold text-[13px] ${
                listening ? 'bg-[#e5322d] text-white' : 'border border-white/20 text-white/70'
              }`}
            >
              <span className="size-[16px]">
                <MicSmallIcon />
              </span>
              {listening ? '말하는 중, 멈추기' : '말로 연습하기'}
            </button>
            <button
              type="button"
              onClick={judge}
              disabled={busy || !answer.trim()}
              className="cta bg-[#f26b1d] flex h-[44px] items-center px-[20px] rounded-[8px] disabled:opacity-40"
            >
              <span className="font-bold text-[15px] text-white whitespace-nowrap">{busy ? '보는 중···' : '판정하기'}</span>
            </button>
          </div>
        </div>

        {judged && (
          <>
            <div className="bg-white/10 h-px w-full" />
            <div className="flex flex-col lg:flex-row gap-[20px] items-stretch w-full">
              <div className="border border-white/12 bg-[#1c1713] flex flex-1 flex-col gap-[16px] px-[24px] py-[22px] rounded-[10px]">
                <div className="flex items-end justify-between w-full">
                  <p className="font-bold text-[14px] text-white/55">근거 커버리지</p>
                  <p className="font-black text-[40px] text-white tracking-[-1.6px]">{ratio}%</p>
                </div>
                <div className="bg-white/10 flex h-[10px] overflow-hidden rounded-[5px] w-full">
                  <div className="bg-[#f26b1d] h-[10px] rounded-[5px]" style={{ width: `${ratio}%` }} />
                </div>
                <div className="flex flex-col gap-[10px] w-full">
                  <p className="font-bold text-[13px] text-white/55 w-full">
                    {judged.missed.length ? '놓친 근거' : '근거를 다 말했어요'}
                  </p>
                  <div className="flex flex-wrap gap-[8px] w-full">
                    {judged.missed.map((m) => (
                      <span key={m} className="border border-[#f26b1d]/60 px-[13px] py-[7px] rounded-full">
                        <span className="font-bold text-[15px] text-white whitespace-nowrap">{m}</span>
                      </span>
                    ))}
                    {judged.covered.map((m) => (
                      <span key={m} className="border border-white/12 px-[13px] py-[7px] rounded-full">
                        <span className="font-medium text-[15px] text-white/45 line-through whitespace-nowrap">{m}</span>
                      </span>
                    ))}
                  </div>
                  {judged.elsewhere.length > 0 && (
                    <p className="font-normal text-[12px] text-white/50 break-keep">
                      같은 슬라이드의 다른 줄에 있는 수치({judged.elsewhere.join(', ')})를 말했어요. 틀린 답은 아니에요.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-[16px] lg:w-[420px]">
                {question.followup && (
                  <div className="border border-white/12 bg-[#1c1713] flex flex-col gap-[8px] px-[22px] py-[20px] rounded-[10px] w-full">
                    <p className="font-bold text-[13px] text-white/55 w-full">예상 꼬리질문</p>
                    <p className="font-bold text-[19px] text-white leading-[28px] w-full break-keep">{question.followup}</p>
                  </div>
                )}
                <div className="border border-white/12 bg-[#1c1713] flex flex-col gap-[8px] px-[22px] py-[20px] rounded-[10px] w-full">
                  <p className="font-bold text-[13px] text-white/55 w-full">p.{question.page} 근거 줄</p>
                  <p className="font-normal text-[16px] text-white/85 leading-[26px] w-full break-keep">{judged.snippet}</p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-white/10 flex items-center justify-between pt-[18px] w-full">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="border border-white/20 flex gap-[8px] h-[44px] items-center px-[20px] rounded-[8px] disabled:opacity-40"
          >
            <span className="size-[16px] text-white">
              <ArrowLeftIcon />
            </span>
            <span className="font-bold text-[15px] text-white whitespace-nowrap">이전 질문</span>
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onFinish() : goTo(index + 1))}
            className="border border-white/20 flex gap-[8px] h-[44px] items-center px-[20px] rounded-[8px]"
          >
            <span className="font-bold text-[15px] text-white whitespace-nowrap">{isLast ? '실전으로' : '다음 질문'}</span>
            <span className="size-[16px] text-white">
              <ArrowRightIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
