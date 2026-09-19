import { useEffect, useState } from 'react';
import { mockPracticeQuestions } from '../mocks/mockPracticeMock';
import { ArrowLeftIcon, ArrowRightIcon, MicSmallIcon } from './icons';

interface MockPracticeScreenProps {
  onFinish: () => void;
  onIndexChange?: (index: number, total: number) => void;
}

export function MockPracticeScreen({ onFinish, onIndexChange }: MockPracticeScreenProps) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [judged, setJudged] = useState(false);

  const question = mockPracticeQuestions[index];
  const total = mockPracticeQuestions.length;
  const isLast = index === total - 1;

  useEffect(() => {
    onIndexChange?.(index, total);
  }, [index, total, onIndexChange]);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(total - 1, next)));
    setAnswer('');
    setJudged(false);
  }

  return (
    <div className="flex flex-1 items-start justify-center py-[38px] w-full">
      <div className="flex flex-col gap-[22px] w-[980px]">
        <div className="flex flex-col gap-[12px] w-full">
          <div className="flex gap-[10px] items-center w-full">
            <span className="border border-[#e5e7eb] px-[11px] py-[5px] rounded-[6px]">
              <span className="font-bold text-[12px] text-[#1a1a1a] whitespace-nowrap">{question.type}</span>
            </span>
            <p className="font-medium text-[12px] text-[#6b7280] whitespace-nowrap">
              예상 질문, 출제 근거 p.{question.basisPage}
            </p>
          </div>
          <p className="font-black text-[30px] text-[#1a1a1a] tracking-[-0.8px] leading-[40px] w-full text-center break-keep">
            {question.question}
          </p>
        </div>

        <div className="flex flex-col gap-[9px] w-full">
          <p className="font-bold text-[13px] text-[#6b7280] w-full">내 답변</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="border border-[#e5e7eb] min-h-[124px] px-[20px] py-[18px] rounded-[6px] text-[17px] text-[#1a1a1a] outline-none w-full resize-none leading-[29px]"
            placeholder="답변을 입력해보세요"
          />
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-[8px] items-center">
              <span className="size-[16px] text-[#6b7280]">
                <MicSmallIcon />
              </span>
              <p className="font-normal text-[13px] text-[#6b7280] whitespace-nowrap">말로 연습하려면 마이크를 켜세요</p>
            </div>
            <button
              type="button"
              onClick={() => setJudged(true)}
              className="bg-[#f26b1d] flex h-[44px] items-center px-[20px] rounded-[6px]"
            >
              <span className="font-bold text-[15px] text-white whitespace-nowrap">판정하기</span>
            </button>
          </div>
        </div>

        {judged && (
          <>
            <div className="bg-[#e5e7eb] h-px w-full" />
            <div className="flex gap-[20px] items-start w-full">
              <div className="border border-[#e5e7eb] flex flex-col gap-[16px] px-[24px] py-[22px] rounded-[6px] self-stretch w-[514px]">
                <div className="flex items-end justify-between w-full">
                  <p className="font-bold text-[14px] text-[#6b7280]">근거 커버리지</p>
                  <p className="font-black text-[40px] text-[#1a1a1a] tracking-[-1.6px]">50%</p>
                </div>
                <div className="bg-[#f3f4f6] flex h-[10px] overflow-hidden rounded-[5px] w-full">
                  <div className="bg-[#1a1a1a] h-[10px] rounded-[5px]" style={{ width: '44%' }} />
                </div>
                <div className="flex flex-col gap-[10px] w-full">
                  <p className="font-bold text-[13px] text-[#6b7280] w-full">놓친 근거</p>
                  <div className="flex flex-wrap gap-[8px] w-full">
                    <span className="border border-[#e5e7eb] px-[13px] py-[7px] rounded-full">
                      <span className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">1,584건</span>
                    </span>
                    <span className="border border-[#e5e7eb] px-[13px] py-[7px] rounded-full">
                      <span className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">41%</span>
                    </span>
                    <span className="border border-[#e5e7eb] px-[13px] py-[7px] rounded-full">
                      <span className="font-medium text-[15px] text-[#6b7280] whitespace-nowrap">
                        p.{question.basisPage} 조사 구간
                      </span>
                    </span>
                  </div>
                  <p className="font-normal text-[11px] text-[#808080] w-full">발표 리포트에 누적돼요</p>
                </div>
              </div>

              <div className="flex flex-col gap-[16px] w-[446px]">
                <div className="border border-[#e5e7eb] flex flex-col gap-[8px] px-[22px] py-[20px] rounded-[6px] w-full">
                  <p className="font-bold text-[13px] text-[#6b7280] w-full">예상 꼬리질문</p>
                  <p className="font-bold text-[19px] text-[#1a1a1a] leading-[28px] w-full">
                    그 부분 구체적인 수치를 말씀해주실 수 있나요?
                  </p>
                </div>
                <div className="border border-[#e5e7eb] flex flex-col gap-[8px] px-[22px] py-[20px] rounded-[6px] w-full">
                  <p className="font-bold text-[13px] text-[#6b7280] w-full">보완 문장 제안</p>
                  <p className="font-normal text-[16px] text-[#1a1a1a] leading-[26px] w-full">
                    “전체 1,584건 중 41%에서 손상이 확인됐고, 그중 토사퇴적이 가장 많았습니다.”
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="border-t border-[#e5e7eb] flex items-center justify-between pt-[18px] w-full">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="border border-[#e5e7eb] flex gap-[8px] h-[44px] items-center px-[20px] rounded-[6px] disabled:opacity-40"
          >
            <span className="size-[16px] text-[#1a1a1a]">
              <ArrowLeftIcon />
            </span>
            <span className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">이전 질문</span>
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onFinish() : goTo(index + 1))}
            className="border border-[#e5e7eb] flex gap-[8px] h-[44px] items-center px-[20px] rounded-[6px]"
          >
            <span className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">{isLast ? '실전으로' : '다음 질문'}</span>
            <span className="size-[16px] text-[#1a1a1a]">
              <ArrowRightIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
