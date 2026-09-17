interface UploadFailedScreenProps {
  onBackToList: () => void;
  onRetry: () => void;
}

export function UploadFailedScreen({ onBackToList, onRetry }: UploadFailedScreenProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">발표자료를 올려주세요</h1>
      <p className="mt-2 text-sm text-gray-500">PPT 또는 PDF, 최대 200MB</p>

      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-red-200 bg-white p-5 text-left shadow-lg">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-xl font-bold text-red-500">
          📄
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">2026_상반기_서비스_기획_발표.pptx</p>
          <p className="mt-1 text-xs font-semibold text-red-500">업로드 실패 (오류 코드: UPLOAD_500)</p>
        </div>
        <button type="button" className="text-sm font-semibold text-orange-500 hover:underline">
          파일 바꾸기
        </button>
      </div>

      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-lg">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-2xl">
          ⚠️
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">실패 원인</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">
            서버가 일시적으로 응답하지 않아 업로드가 중단되었습니다. 파일 용량이 크거나 네트워크 상태가
            불안정할 때 발생할 수 있어요.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-left text-sm text-orange-800">
        <strong className="font-bold">이런 경우 도움이 될 수 있어요</strong>
        <p className="mt-1">Wi-Fi 연결을 확인하거나, 파일을 200MB 이하로 압축한 뒤 다시 시도해보세요.</p>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={onBackToList}
          className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          발표 목록으로
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
