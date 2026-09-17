import { useRef, useState } from 'react';

interface UploadScreenProps {
  onSkip: () => void;
  onStartMock: () => void;
}

export function UploadScreen({ onSkip, onStartMock }: UploadScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : null);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">발표자료를 올려주세요</h1>
      <p className="mt-2 text-sm text-gray-500">PPT 또는 PDF, 최대 200MB</p>

      <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" onChange={handleFileChange} className="hidden" />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-8 w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-base font-medium text-gray-500 hover:bg-gray-50"
        >
          클릭해서 파일 선택
        </button>
      ) : (
        <>
          <div className="mt-8 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-lg">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl font-bold text-orange-500">
              📄
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold text-gray-900">{fileName}</p>
              <p className="mt-1 text-xs text-gray-500">24.3MB · 슬라이드 18장 · 업로드 완료</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:underline"
            >
              파일 바꾸기
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-lg">
            <p className="mb-4 text-sm font-bold text-gray-900">준비 단계</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">글자 읽기</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> 완료
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">이미지 슬라이드 읽기</span>
                  <span className="text-xs font-semibold text-orange-500">65%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-orange-500" style={{ width: '65%' }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">검색 준비</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> 대기
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-left text-sm text-orange-800">
            <strong className="font-bold">12번 슬라이드는 이미지라 AI가 그림으로 읽었습니다.</strong> 내용이
            정확한지 한 번 확인해보세요.
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              건너뛰고 실전
            </button>
            <button
              type="button"
              onClick={onStartMock}
              className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
            >
              모의 연습 시작
            </button>
          </div>
        </>
      )}
    </div>
  );
}
