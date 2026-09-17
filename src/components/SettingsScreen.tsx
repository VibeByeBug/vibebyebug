import { useState } from 'react';

export function SettingsScreen() {
  const [sourceCount, setSourceCount] = useState<3 | 5>(3);
  const [mic, setMic] = useState('MacBook Pro 마이크');
  const [watchConnected, setWatchConnected] = useState(true);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">근거 표시 개수</p>
        <p className="mt-1 text-xs text-gray-500">실시간 Q&amp;A 화면에서 보여줄 근거 슬라이드 수예요</p>
        <div className="mt-4 flex gap-3">
          {([3, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSourceCount(n)}
              className={`rounded-xl border px-6 py-2.5 text-sm font-semibold ${
                sourceCount === n
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {n}개
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">마이크</p>
        <select
          value={mic}
          onChange={(e) => setMic(e.target.value)}
          className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        >
          <option>MacBook Pro 마이크</option>
          <option>AirPods Pro</option>
          <option>외장 USB 마이크</option>
        </select>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <p className="text-sm font-bold text-gray-900">갤럭시 워치</p>
        <div className="mt-4 flex items-center justify-between">
          <span
            className={`flex items-center gap-1.5 text-sm font-semibold ${
              watchConnected ? 'text-green-600' : 'text-gray-400'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${watchConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            {watchConnected ? '연결됨' : '연결 안 됨'}
          </span>
          {watchConnected && (
            <button
              type="button"
              onClick={() => setWatchConnected(false)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              연결 해제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
