import { useState } from 'react';
import { mockRecentPresentations } from '../mocks/recentMock';

interface StartScreenProps {
  onStart: (title: string) => void;
  onOpenReport: () => void;
}

export function StartScreen({ onStart, onOpenReport }: StartScreenProps) {
  const [title, setTitle] = useState('');

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-12 px-4 py-4">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-white p-8 text-center shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 발표 준비</h1>
          <p className="mt-2 text-sm text-gray-500">발표 이름을 적어주세요.</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026 하반기 성과 발표"
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3.5 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
          <button
            type="button"
            onClick={() => onStart(title.trim() || '제목 없는 발표')}
            className="whitespace-nowrap rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-bold text-white hover:bg-orange-600"
          >
            시작하기 →
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900">최근 발표</h2>
        <div className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-lg">
          {mockRecentPresentations.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={onOpenReport}
              className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50"
            >
              <span className="h-14 w-20 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-100" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-900">{p.name}</span>
                <span className="mt-1 block text-xs text-gray-400">{p.date}</span>
              </span>
              <span className="text-gray-300">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
