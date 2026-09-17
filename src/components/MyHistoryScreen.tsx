import { accuracyByType, frequentlyMissed, historyRecords } from '../mocks/historyMock';

interface MyHistoryScreenProps {
  onOpenReport: () => void;
}

const weakestType = accuracyByType.reduce((min, cur) => (cur.value < min.value ? cur : min));

export function MyHistoryScreen({ onOpenReport }: MyHistoryScreenProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <h1 className="text-2xl font-bold text-gray-900">내 기록</h1>

      <div className="mt-6 flex flex-wrap items-center gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-2xl font-bold text-orange-500">
          사
        </span>
        <div>
          <p className="text-lg font-bold text-gray-900">사용자</p>
          <p className="text-sm text-gray-500">seott@mju.ac.kr</p>
        </div>
        <div className="ml-auto flex gap-8 text-center">
          <div>
            <p className="text-2xl font-black text-orange-500">36</p>
            <p className="text-xs text-gray-500">총 연습 횟수</p>
          </div>
          <div>
            <p className="text-2xl font-black text-orange-500">3</p>
            <p className="text-xs text-gray-500">실전 발표 횟수</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">질문 유형별 답변 정확도</p>
        <div className="mt-4 space-y-4">
          {accuracyByType.map((d) => (
            <div key={d.type}>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>{d.type}</span>
                {d.type === weakestType.type && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500">
                    가장 약한 유형
                  </span>
                )}
                <span className="ml-auto font-semibold">{d.value}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-orange-500" style={{ width: `${d.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">자주 놓치는 근거</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400">
              <th className="pb-2 font-medium">발표 이름</th>
              <th className="pb-2 font-medium">슬라이드</th>
              <th className="pb-2 font-medium">내용</th>
              <th className="pb-2 font-medium">횟수</th>
            </tr>
          </thead>
          <tbody>
            {frequentlyMissed.map((m) => (
              <tr key={`${m.presentation}-${m.page}`} className="border-b border-gray-50">
                <td className="py-3 text-gray-700">{m.presentation}</td>
                <td className="py-3 text-gray-700">p.{m.page}</td>
                <td className="py-3 text-gray-700">{m.content}</td>
                <td className="py-3 font-semibold text-orange-500">{m.count}회</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">발표 기록</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-400">
              <th className="pb-2 font-medium">발표</th>
              <th className="pb-2 font-medium">날짜</th>
              <th className="pb-2 font-medium">연습</th>
              <th className="pb-2 font-medium">실전 질문</th>
              <th className="pb-2 font-medium">적중률</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {historyRecords.map((h) => (
              <tr key={h.id} className="border-b border-gray-50">
                <td className="flex items-center gap-3 py-3">
                  <span className="h-10 w-14 rounded-md border border-gray-200 bg-gray-100" />
                  <span className="font-medium text-gray-800">{h.name}</span>
                </td>
                <td className="py-3 text-gray-500">{h.date}</td>
                <td className="py-3 text-gray-700">{h.practiceCount}회</td>
                <td className="py-3 text-gray-700">{h.liveQuestions}개</td>
                <td className="py-3 font-semibold text-orange-500">{h.hitRate}%</td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={onOpenReport}
                    className="text-xs font-semibold text-orange-500 hover:underline"
                  >
                    리포트 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
