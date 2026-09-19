import { useState } from 'react';
import type { AnswerMode } from '../types/qa';
import { ChevronDownIcon, MicSmallIcon, WatchIcon } from './icons';

interface SettingsScreenProps {
  mode: AnswerMode;
  onModeChange: (mode: AnswerMode) => void;
}

const MODE_LABEL: Record<AnswerMode, string> = { keywords: '키워드', flow: '흐름도', answer: '추천 답변' };

export function SettingsScreen({ mode, onModeChange }: SettingsScreenProps) {
  const [sourceCount, setSourceCount] = useState<3 | 5>(3);
  const [watchConnected, setWatchConnected] = useState(true);

  return (
    <div className="flex flex-col pb-[44px] pt-[34px] px-[44px] w-full">
      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-black text-[30px] text-[#1a1a1a] tracking-[-0.8px] w-full text-center">설정</p>
        <div className="flex flex-col items-start w-full">
          <div className="border-t border-[#e5e7eb] flex gap-[20px] items-center px-[4px] py-[16px] w-full">
            <div className="flex flex-col gap-[4px] w-[280px]">
              <p className="font-bold text-[16px] text-[#1a1a1a] w-full">답변 보기</p>
              <p className="font-normal text-[13px] text-[#6b7280] w-full">
                흐름도와 추천 답변은 키워드 뒤 1~3초에 뜨고, 질문마다 AI를 한 번 호출합니다
              </p>
            </div>
            <div className="flex gap-[8px] items-start">
              {(['keywords', 'flow', 'answer'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  className={`flex h-[40px] items-center px-[20px] rounded-[6px] ${
                    mode === m ? 'bg-[#f26b1d]' : 'border border-[#e5e7eb]'
                  }`}
                >
                  <span className={`text-[15px] whitespace-nowrap ${mode === m ? 'font-bold text-white' : 'font-medium text-[#6b7280]'}`}>
                    {MODE_LABEL[m]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#e5e7eb] flex gap-[20px] items-center px-[4px] py-[16px] w-full">
            <div className="flex flex-col gap-[4px] w-[280px]">
              <p className="font-bold text-[16px] text-[#1a1a1a] w-full">근거 표시 개수</p>
              <p className="font-normal text-[13px] text-[#6b7280] w-full">실전 화면에 한 번에 보여줄 카드 수</p>
            </div>
            <div className="flex gap-[8px] items-start">
              {([3, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSourceCount(n)}
                  className={`flex h-[40px] items-center px-[20px] rounded-[6px] ${
                    sourceCount === n ? 'bg-[#f26b1d]' : 'border border-[#e5e7eb]'
                  }`}
                >
                  <span className={`text-[15px] whitespace-nowrap ${sourceCount === n ? 'font-bold text-white' : 'font-medium text-[#6b7280]'}`}>
                    {n}개
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#e5e7eb] flex gap-[20px] items-center px-[4px] py-[16px] w-full">
            <div className="flex flex-col gap-[4px] w-[280px]">
              <p className="font-bold text-[16px] text-[#1a1a1a] w-full">마이크</p>
              <p className="font-normal text-[13px] text-[#6b7280] w-full">질문을 받을 입력 장치</p>
            </div>
            <div className="border border-[#e5e7eb] flex h-[44px] items-center justify-between px-[14px] rounded-[6px] w-[340px]">
              <div className="flex gap-[10px] items-center">
                <span className="size-[17px] text-[#6b7280]">
                  <MicSmallIcon />
                </span>
                <p className="font-medium text-[15px] text-[#1a1a1a] whitespace-nowrap">MacBook Pro 마이크 (내장)</p>
              </div>
              <span className="size-[14px] text-[#6b7280]">
                <ChevronDownIcon />
              </span>
            </div>
          </div>

          <div className="border-y border-[#e5e7eb] flex gap-[20px] items-center px-[4px] py-[16px] w-full">
            <div className="flex flex-col gap-[4px] w-[280px]">
              <p className="font-bold text-[16px] text-[#1a1a1a] w-full">갤럭시 워치</p>
              <p className="font-normal text-[13px] text-[#6b7280] w-full">손목에서 질문 유형과 슬라이드 번호 확인</p>
            </div>
            {watchConnected ? (
              <>
                <div className="flex flex-1 gap-[10px] items-center">
                  <span className="size-[18px] text-[#1a1a1a]">
                    <WatchIcon />
                  </span>
                  <p className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">연결됨, Galaxy Watch6</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWatchConnected(false)}
                  className="border border-[#e5e7eb] flex h-[40px] items-center px-[16px] rounded-[6px]"
                >
                  <span className="font-bold text-[14px] text-[#6b7280] whitespace-nowrap">연결 해제</span>
                </button>
              </>
            ) : (
              <p className="flex-1 font-medium text-[15px] text-[#6b7280]">연결 안 됨</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
