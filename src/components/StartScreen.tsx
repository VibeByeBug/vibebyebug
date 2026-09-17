import { useState } from 'react';
import { mockRecentPresentations } from '../mocks/recentMock';
import { ArrowRightIcon } from './icons';

interface StartScreenProps {
  onStart: (title: string) => void;
  onOpenReport: () => void;
}

export function StartScreen({ onStart, onOpenReport }: StartScreenProps) {
  const [title, setTitle] = useState('');

  return (
    <div className="flex flex-1 items-center justify-center w-full">
      <div className="flex flex-col gap-[28px] w-[480px]">
        <div className="flex flex-col gap-[9px] text-center w-full">
          <p className="font-bold text-[34px] text-[#1a1a1a] tracking-[-1.19px] leading-[42px] w-full">
            새 발표 준비
          </p>
          <p className="font-normal text-[15px] text-[#6b7280] leading-[24px] w-full">발표 이름을 적어주세요.</p>
        </div>

        <div className="flex flex-col gap-[10px] w-full">
          <p className="font-bold text-[13px] text-[#6b7280] w-full">발표 이름</p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 캡스톤 디자인 최종 발표"
            className="border border-[#1a1a1a] h-[52px] px-[16px] rounded-[6px] text-[17px] font-medium text-[#1a1a1a] outline-none w-full"
          />
          <button
            type="button"
            onClick={() => onStart(title.trim() || '제목 없는 발표')}
            className="bg-[#f26b1d] flex gap-[8px] h-[52px] items-center justify-center rounded-[6px] w-full"
          >
            <span className="font-bold text-[17px] text-white">시작하기</span>
            <span className="size-[18px] text-white">
              <ArrowRightIcon />
            </span>
          </button>
        </div>

        <div className="border-t border-[#e5e7eb] flex flex-col gap-[12px] pt-[18px] w-full">
          <p className="font-bold text-[13px] text-[#6b7280] w-full">최근 발표</p>
          {mockRecentPresentations.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={onOpenReport}
              className="flex gap-[12px] items-center w-full text-left"
            >
              <span className="bg-[#f3f4f6] border border-[#e5e7eb] h-[32px] rounded-[6px] shrink-0 w-[56px]" />
              <span className="flex-1 font-medium text-[15px] text-[#1a1a1a] underline">{p.name}</span>
              <span className="font-normal text-[13px] text-[#6b7280] whitespace-nowrap">{p.date}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
