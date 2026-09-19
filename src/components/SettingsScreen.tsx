import { useState } from 'react';
import { ChevronDownIcon, MicSmallIcon, WatchIcon } from './icons';

// 답변 보기(키워드, 흐름도, 추천 답변) 고르기는 없앴다. 실전 화면은 추천 답변과 흐름도를 항상 같이 보여준다.
export function SettingsScreen() {
  const [sourceCount, setSourceCount] = useState<3 | 5>(3);
  const [watchConnected, setWatchConnected] = useState(true);

  return (
    <div className="flex flex-col pb-[44px] pt-[34px] px-[44px] w-full">
      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-black text-[30px] text-[#1a1a1a] tracking-[-0.8px] w-full text-center">설정</p>
        <div className="flex flex-col items-start w-full">
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
