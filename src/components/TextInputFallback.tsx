import { useState } from 'react';

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
      {sttError && (
        <div className="self-start rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
          음성 인식 오류 — 직접 입력해주세요
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="질문을 입력해주세요"
          className="flex-1 rounded-full border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none focus:border-orange-500"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500 text-lg text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          →
        </button>
      </div>
    </div>
  );
}
