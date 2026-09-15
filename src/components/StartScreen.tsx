import { useState } from 'react';

interface StartScreenProps {
  onStart: (title: string) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [title, setTitle] = useState('');

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-lg">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-500 text-center text-sm font-bold leading-tight text-white">
        Ready-Q
      </div>

      <div className="flex w-full flex-col gap-2">
        <label htmlFor="presentation-title" className="text-sm font-medium text-gray-700">
          발표 이름
        </label>
        <input
          id="presentation-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 2026 하반기 성과 발표"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none focus:border-orange-500"
        />
      </div>

      <button
        type="button"
        onClick={() => onStart(title.trim())}
        disabled={!title.trim()}
        className="w-full rounded-lg bg-[#4D4D4D] px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 enabled:hover:bg-gray-700"
      >
        시작하기
      </button>
    </div>
  );
}
