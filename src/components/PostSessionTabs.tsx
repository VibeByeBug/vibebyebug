import { useState } from 'react';
import { PreviousQuestionsList } from './PreviousQuestionsList';
import { RetrospectiveReport } from './RetrospectiveReport';

type PostSessionTab = 'report' | 'history';

const TABS: { key: PostSessionTab; label: string }[] = [
  { key: 'report', label: '회고 리포트' },
  { key: 'history', label: '이전 질문 목록' },
];

export function PostSessionTabs() {
  const [tab, setTab] = useState<PostSessionTab>('report');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              tab === item.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'report' ? <RetrospectiveReport /> : <PreviousQuestionsList />}
    </div>
  );
}
