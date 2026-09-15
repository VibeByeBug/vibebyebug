import { useRef, useState } from 'react';

interface UploadScreenProps {
  onNext: (fileName: string) => void;
}

export function UploadScreen({ onNext }: UploadScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : null);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-lg">
      <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
      >
        PDF 파일 선택
      </button>

      {fileName && (
        <div className="flex w-full items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <span>📄</span>
          <span className="truncate">{fileName}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => fileName && onNext(fileName)}
        disabled={!fileName}
        className="w-full rounded-lg bg-[#4D4D4D] px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 enabled:hover:bg-gray-700"
      >
        업로드
      </button>

      <p className="text-xs text-gray-400">지원 형식: PDF · 최대 용량: 50MB</p>
    </div>
  );
}
