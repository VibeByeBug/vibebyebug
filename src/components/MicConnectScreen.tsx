interface MicConnectScreenProps {
  onConnect: () => void;
}

export function MicConnectScreen({ onConnect }: MicConnectScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-8 text-center shadow-lg">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gray-100 text-5xl">🎙</div>
      <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> 마이크 권한: 허용됨
      </span>
      <div>
        <h1 className="text-xl font-bold text-gray-900">마이크를 연결해주세요</h1>
        <p className="mt-2 text-sm text-gray-500">연결하면 실시간으로 질문을 듣고 답변을 준비해요</p>
      </div>
      <button
        type="button"
        onClick={onConnect}
        className="rounded-full bg-orange-500 px-10 py-3.5 text-sm font-bold text-white hover:bg-orange-600"
      >
        연결하기
      </button>
    </div>
  );
}
