interface ErrorScreenProps {
  onEditQuestion: () => void;
  onRetry: () => void;
}

export function ErrorScreen({ onEditQuestion, onRetry }: ErrorScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-lg">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl font-bold text-red-500">
        !
      </div>
      <h2 className="text-xl font-semibold text-gray-900">근거 자료를 찾지 못했어요</h2>
      <p className="text-sm text-gray-500">
        업로드한 자료에서 질문과 관련된 근거를 찾지 못했습니다. 질문을 다시 확인하거나 다시 시도해주세요.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onEditQuestion}
          className="rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          질문 수정
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
