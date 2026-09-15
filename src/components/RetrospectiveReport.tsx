import { mockRetrospectiveStats } from '../mocks/postSessionMock';

export function RetrospectiveReport() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-gray-900">발표 회고 리포트</h2>
      <div className="grid grid-cols-3 gap-3">
        {mockRetrospectiveStats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 rounded-xl bg-gray-50 px-4 py-3 text-center">
            <span className="text-xl font-semibold text-orange-600">{stat.value}</span>
            <span className="text-xs text-gray-500">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
