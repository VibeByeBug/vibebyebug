import { useRef, useState } from 'react';
import { uploadPdf, type UploadResult } from '../api';
import { DocumentIcon, RefreshIcon, SearchIcon, ImageIcon, WarningIcon, CheckIcon } from './icons';

interface UploadScreenProps {
  onSkip: () => void;
  onStartMock: () => void;
  onUploaded: (result: UploadResult) => void;
  onUploadFail: (fileName: string, message: string) => void;
}

export function UploadScreen({ onSkip, onStartMock, onUploaded, onUploadFail }: UploadScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일을 다시 골라도 change 가 오게
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    try {
      // 서버가 글자를 읽고, 글자가 없는 장은 이미지로 읽은 뒤 응답한다
      const r = await uploadPdf(file);
      setResult(r);
      onUploaded(r);
    } catch (err) {
      setFileName(null);
      onUploadFail(file.name, err instanceof Error ? err.message : '서버에서 파일 처리에 실패했습니다');
    }
  }

  const captioned = result?.captioned ?? [];
  const unreadable = result?.unreadable ?? [];
  const textSlides = result ? result.slides - captioned.length : 0;

  return (
    <div className="flex flex-1 items-center justify-center py-[44px] w-full">
      <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
      <div className="flex flex-col gap-[26px] w-[880px]">
        <div className="flex flex-col gap-[7px] w-full">
          <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px] w-full">
            발표자료를 올려주세요
          </p>
          <p className="font-normal text-[15px] text-[#6b7280] w-full">PDF, 최대 50MB</p>
        </div>

        {!fileName ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="border border-dashed border-[#e5e7eb] flex items-center justify-center px-[26px] py-[40px] rounded-[6px] w-full text-[15px] font-medium text-[#6b7280]"
          >
            클릭해서 파일을 선택하세요
          </button>
        ) : (
          <>
            <div className="border border-[#e5e7eb] flex gap-[18px] items-center p-[26px] rounded-[6px] w-full">
              <span className="size-[40px] text-[#1a1a1a] shrink-0">
                <DocumentIcon />
              </span>
              <div className="flex flex-col flex-1 gap-[5px] min-w-0">
                <p className="font-bold text-[17px] text-[#1a1a1a] w-full">{fileName}</p>
                <p className="font-normal text-[14px] text-[#6b7280] w-full">
                  {result
                    ? `${result.sizeMb.toFixed(1)}MB, 슬라이드 ${result.slides}장, 업로드 완료`
                    : '업로드하고 슬라이드를 읽는 중···'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!result}
                className="border border-[#e5e7eb] flex gap-[7px] h-[40px] items-center px-[16px] rounded-[6px] shrink-0 disabled:opacity-40"
              >
                <span className="size-[16px] text-[#1a1a1a]">
                  <RefreshIcon />
                </span>
                <span className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">파일 바꾸기</span>
              </button>
            </div>

            <div className="border border-[#e5e7eb] flex flex-col gap-[14px] px-[26px] py-[24px] rounded-[6px] w-full">
              <p className="font-bold text-[15px] text-[#1a1a1a] w-full">준비 단계</p>
              <div className="flex flex-col w-full">
                <div className="border-t border-[#e5e7eb] flex gap-[14px] items-center py-[13px] w-full">
                  <span className="size-[20px] text-[#1a1a1a]">
                    <CheckIcon />
                  </span>
                  <p className="flex-1 font-medium text-[16px] text-[#1a1a1a]">글자 읽기</p>
                  <p className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">
                    {result ? `${textSlides}장 완료` : '진행 중'}
                  </p>
                </div>
                <div className="border-t border-[#e5e7eb] flex gap-[14px] items-center py-[13px] w-full">
                  <span className="size-[20px] text-[#1a1a1a]">
                    <ImageIcon />
                  </span>
                  <p className="flex-1 font-bold text-[16px] text-[#1a1a1a]">이미지 슬라이드 읽기</p>
                  <p className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">
                    {!result
                      ? '진행 중'
                      : captioned.length + unreadable.length === 0
                        ? '필요 없음'
                        : `${captioned.length} / ${captioned.length + unreadable.length}장`}
                  </p>
                </div>
                <div className="border-y border-[#e5e7eb] flex gap-[14px] items-center py-[13px] w-full">
                  <span className="size-[20px] text-[#6b7280]">
                    <SearchIcon />
                  </span>
                  <p className="flex-1 font-medium text-[16px] text-[#6b7280]">검색 준비</p>
                  <p className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">{result ? '다음 단계' : '대기'}</p>
                </div>
              </div>
            </div>

            {captioned.length > 0 && (
              <div className="bg-[#fff3eb] border border-[#f26b1d] flex gap-[12px] items-start px-[20px] py-[18px] rounded-[6px] w-full">
                <span className="size-[22px] text-[#f26b1d] shrink-0">
                  <WarningIcon />
                </span>
                <div className="flex flex-col gap-[5px]">
                  <p className="font-bold text-[15px] text-[#1a1a1a] leading-[22px]">
                    {captioned.join(', ')}번 슬라이드는 이미지라 AI가 그림으로 읽었습니다
                  </p>
                  <p className="font-normal text-[14px] text-[#6b7280] leading-[22px]">
                    숫자가 정확하지 않을 수 있습니다. 해당 슬라이드의 핵심 수치는 직접 확인해 주세요.
                  </p>
                </div>
              </div>
            )}

            {unreadable.length > 0 && (
              <div className="bg-[#fae5e0] border border-[#bf382e] flex gap-[12px] items-start px-[20px] py-[18px] rounded-[6px] w-full">
                <span className="size-[22px] text-[#bf382e] shrink-0">
                  <WarningIcon />
                </span>
                <div className="flex flex-col gap-[5px]">
                  <p className="font-bold text-[15px] text-[#1a1a1a] leading-[22px]">
                    {unreadable.join(', ')}번 슬라이드는 읽지 못해 근거로 쓸 수 없습니다
                  </p>
                  <p className="font-normal text-[14px] text-[#6b7280] leading-[22px]">{result?.unreadable_message}</p>
                </div>
              </div>
            )}

            <div className="flex gap-[10px] items-start justify-end w-full">
              <button
                type="button"
                onClick={onSkip}
                disabled={!result}
                className="border border-[#e5e7eb] flex h-[50px] items-center px-[20px] rounded-[6px] disabled:opacity-40"
              >
                <span className="font-bold text-[16px] text-[#6b7280] whitespace-nowrap">건너뛰고 실전</span>
              </button>
              <button
                type="button"
                onClick={onStartMock}
                disabled={!result}
                className="bg-[#f26b1d] flex h-[50px] items-center px-[26px] rounded-[6px] disabled:opacity-40"
              >
                <span className="font-bold text-[16px] text-white whitespace-nowrap">모의 연습 시작</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
