import { mockQuestionLog } from '../mocks/postSessionMock';

export function PreviousQuestionsList() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-gray-900">이전 질문 목록</h2>
      {mockQuestionLog.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-1 rounded-xl bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">{entry.question}</span>
            <span className="shrink-0 text-xs text-gray-400">{entry.askedAt}</span>
          </div>
          <p className="text-sm text-gray-500">{entry.answerSnippet}</p>
        </div>
      ))}
    </div>
  );
}
