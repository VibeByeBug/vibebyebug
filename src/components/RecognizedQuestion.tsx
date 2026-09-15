interface RecognizedQuestionProps {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}

export function RecognizedQuestion({ partialText, finalText, isConfirmed }: RecognizedQuestionProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
      <span
        className={`self-start rounded-full px-3 py-1 text-sm font-medium ${
          isConfirmed ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {isConfirmed ? '질문 확정' : '인식 중...'}
      </span>

      <div
        className={`rounded-xl px-5 py-4 text-lg ${
          isConfirmed
            ? 'border-2 border-orange-500 font-semibold text-gray-900'
            : 'border border-gray-200 text-gray-400'
        }`}
      >
        {isConfirmed ? finalText : partialText || '질문을 듣고 있어요...'}
      </div>
    </div>
  );
}
