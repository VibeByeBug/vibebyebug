import { missedSources, typeDistribution } from '../mocks/reportMock';

interface ReportProps {
  presentationName: string;
  onNextPresentation: () => void;
}

export function Report({ presentationName, onNextPresentation }: ReportProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{presentationName}</h1>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
            <span>2026.09.17</span>
            <span>Q&amp;A 시간 12분 30초</span>
            <span>질문 8개</span>
            <span>평균 응답 18초</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            PDF 저장
          </button>
          <button
            type="button"
            onClick={onNextPresentation}
            className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
          >
            다음 발표 준비
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">처리 결과</p>
        <div className="mt-4 flex h-8 w-full overflow-hidden rounded-full">
          <div className="flex items-center justify-center bg-orange-500 text-xs font-bold text-white" style={{ width: '55%' }}>
            55%
          </div>
          <div
            className="flex items-center justify-center text-xs font-bold text-white"
            style={{ width: '30%', backgroundColor: '#F6944D' }}
          >
            30%
          </div>
          <div
            className="flex items-center justify-center text-xs font-bold text-orange-800"
            style={{ width: '15%', backgroundColor: '#FBD9BB' }}
          >
            15%
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> 근거 표시 (5개)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#F6944D' }} /> 근거 없음 (2개)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#FBD9BB' }} /> 잡음 무시 (1개)
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
          <p className="text-sm font-bold text-gray-900">예상 질문 적중률</p>
          <p className="mt-4 text-5xl font-black text-orange-500">73%</p>
          <p className="mt-2 text-sm text-gray-500">모의 연습에서 준비한 질문과 실제 질문이 일치한 비율이에요</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
          <p className="text-sm font-bold text-gray-900">질문 유형 분포</p>
          <div className="mt-4 space-y-3">
            {typeDistribution.map((d) => (
              <div key={d.type}>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{d.type}</span>
                  <span className="font-semibold">{d.value}%</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-orange-500" style={{ width: `${d.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">연습에서 자주 놓친 근거</p>
        <div className="mt-4 divide-y divide-gray-100">
          {missedSources.map((m) => (
            <div key={m.page} className="flex items-center gap-4 py-3">
              <span className="h-14 w-20 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-100" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-orange-500">p.{m.page}</p>
                <p className="mt-0.5 text-sm text-gray-700">{m.content}</p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
                {m.count}회 놓침
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
