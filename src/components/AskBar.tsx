import { useState } from 'react';
import { ArrowRightIcon } from './icons';

// 실전 화면 아래에 늘 떠 있는 글 질문 줄. 마이크를 켠 채로도 적어서 바로 물을 수 있다.
// (전에는 헤더의 "글로 질문하기" 로 화면을 바꿔야 했고, 질문 인식 중 화면에는 그 버튼도 없었다)
export function AskBar({ onAsk }: { onAsk: (text: string) => void }) {
  const [text, setText] = useState('');

  function send() {
    const t = text.trim();
    if (!t) return;
    onAsk(t);
    setText('');
  }

  return (
    <div className="sticky bottom-0 z-10 w-full bg-gradient-to-t from-[#15110d] via-[#15110d]/95 to-transparent pt-[18px] pb-[18px] px-[16px]">
      <div className="mx-auto flex max-w-[760px] items-center gap-[8px] rounded-full border border-white/15 bg-[#1e1914] pl-[20px] pr-[6px] py-[6px] focus-within:border-[#f26b1d] transition-colors">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyUp={(e) => {
            // 한글 조합 중 Enter 는 글자 확정으로 먹히므로 조합이 끝난 keyup 에서 보낸다
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
          }}
          placeholder="말 대신 글로 질문하기 (Enter)"
          className="flex-1 min-w-0 bg-transparent text-[15px] text-white placeholder:text-white/35 outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          aria-label="질문 보내기"
          className="cta flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#f26b1d] disabled:opacity-30"
        >
          <span className="size-[17px] text-white">
            <ArrowRightIcon />
          </span>
        </button>
      </div>
    </div>
  );
}
