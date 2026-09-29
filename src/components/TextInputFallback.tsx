import { useState } from 'react';
import { ArrowRightIcon } from './icons';

interface TextInputFallbackProps {
  onSubmit: (text: string) => void;
  sttError?: boolean;
}

export function TextInputFallback({ onSubmit, sttError = true }: TextInputFallbackProps) {
  const [text, setText] = useState('');

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-[36px] pt-[32px] px-[44px] w-full">
      <div className="flex flex-col gap-[16px] w-[600px]">
        {sttError && (
          <span className="self-start bg-[#fff3eb] px-[12px] py-[6px] rounded-full">
            <span className="font-bold text-[13px] text-[#f26b1d]">음성 인식 오류 — 직접 입력해주세요</span>
          </span>
        )}
        <div className="flex gap-[10px] items-center w-full">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyUp={(e) => {
              // 한글 조합 중 누른 Enter 는 keydown 에서 글자 확정으로 먹힌다.
              // keydown 으로 받으면 전송이 안 되거나 두 번 눌러야 해서, 조합이 끝난 뒤인 keyup 에서 보낸다.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit();
            }}
            placeholder="질문을 입력해주세요"
            className="flex-1 border border-[#e5e7eb] rounded-[6px] px-[16px] py-[14px] text-[16px] text-[#1a1a1a] outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="bg-[#f26b1d] flex h-[48px] items-center justify-center rounded-[6px] shrink-0 w-[48px] disabled:bg-[#e5e7eb]"
          >
            <span className="size-[18px] text-white">
              <ArrowRightIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
