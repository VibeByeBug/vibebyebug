import { useState } from 'react';
import { mockPracticeQuestions } from '../mocks/mockPracticeMock';

interface MockPracticeScreenProps {
  onFinish: () => void;
}

const missedBasis = ['시장 규모 데이터', '경쟁사 비교표'];
const followUps = ['그 수치의 산출 근거는 무엇인가요?', '다른 시나리오도 고려하셨나요?'];

export function MockPracticeScreen({ onFinish }: MockPracticeScreenProps) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [judged, setJudged] = useState(false);

  const question = mockPracticeQuestions[index];
  const total = mockPracticeQuestions.length;
  const isLast = index === total - 1;

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(total - 1, next)));
    setAnswer('');
    setJudged(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {index + 1} / {total} 문항
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600">
          {question.type}
        </span>
        <span className="text-xs text-gray-400">출제 근거 p.{question.basisPage}</span>
      </div>
      <h1 className="mt-3 text-[21px] font-bold leading-snug text-gray-900">{question.question}</h1>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={5}
          placeholder="답변을 입력해보세요..."
          className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">🎙 말로 연습하려면 마이크를 켜세요</span>
          <button
            type="button"
            onClick={() => setJudged(true)}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
          >
            판정하기
          </button>
        </div>
      </div>

      {judged && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
            <p className="text-sm font-bold text-gray-900">근거 커버리지 62%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-orange-500" style={{ width: '62%' }} />
            </div>
            <p className="mt-4 text-xs font-semibold text-gray-500">놓친 근거</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missedBasis.map((m) => (
                <span key={m} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-800">
                  {m}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-400">발표 리포트에 누적돼요</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
            <p className="text-sm font-bold text-gray-900">예상 꼬리질문</p>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
              {followUps.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-bold text-gray-900">보완 문장 제안</p>
            <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              "해당 수치는 p.{question.basisPage} 자료의 시장 조사 결과를 기반으로 산정했습니다."
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          ← 이전 질문
        </button>
        <button
          type="button"
          onClick={() => (isLast ? onFinish() : goTo(index + 1))}
          className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {isLast ? '실전으로 →' : '다음 질문 →'}
        </button>
      </div>
    </div>
  );
}
