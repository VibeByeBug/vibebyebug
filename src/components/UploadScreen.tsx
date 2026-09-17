import { useRef, useState } from 'react';
import { DocumentIcon, RefreshIcon, SearchIcon, ImageIcon, WarningIcon, CheckIcon } from './icons';

interface UploadScreenProps {
  onSkip: () => void;
  onStartMock: () => void;
  onUploadFail: () => void;
  forceFail?: boolean;
}

export function UploadScreen({ onSkip, onStartMock, onUploadFail, forceFail = false }: UploadScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (forceFail) {
      onUploadFail();
      return;
    }
    setFileName(file ? file.name : 'capstone_final.pdf');
  }

  return (
    <div className="flex flex-1 items-center justify-center py-[44px] w-full">
      <input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" onChange={handleFileChange} className="hidden" />
      <div className="flex flex-col gap-[26px] w-[880px]">
        <div className="flex flex-col gap-[7px] w-full">
          <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px] w-full">
            발표자료를 올려주세요
          </p>
          <p className="font-normal text-[15px] text-[#6b7280] w-full">PPT 또는 PDF, 최대 200MB</p>
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
                <p className="font-normal text-[14px] text-[#6b7280] w-full">18.4MB, 슬라이드 24장, 업로드 완료</p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="border border-[#e5e7eb] flex gap-[7px] h-[40px] items-center px-[16px] rounded-[6px] shrink-0"
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
                  <p className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">24장 완료</p>
                </div>
                <div className="border-t border-[#e5e7eb] flex gap-[14px] items-center py-[13px] w-full">
                  <span className="size-[20px] text-[#1a1a1a]">
                    <ImageIcon />
                  </span>
                  <div className="flex flex-1 flex-col gap-[7px] min-w-0">
                    <p className="font-bold text-[16px] text-[#1a1a1a] w-full">이미지 슬라이드 읽기</p>
                    <div className="bg-[#f3f4f6] flex h-[6px] overflow-hidden rounded-[3px] w-full">
                      <div className="bg-[#1a1a1a] h-[6px] rounded-[3px]" style={{ width: '64%' }} />
                    </div>
                  </div>
                  <p className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">7 / 11장</p>
                </div>
                <div className="border-y border-[#e5e7eb] flex gap-[14px] items-center py-[13px] w-full">
                  <span className="size-[20px] text-[#6b7280]">
                    <SearchIcon />
                  </span>
                  <p className="flex-1 font-medium text-[16px] text-[#6b7280]">검색 준비</p>
                  <p className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">대기</p>
                </div>
              </div>
            </div>

            <div className="bg-[#fff3eb] border border-[#f26b1d] flex gap-[12px] items-start px-[20px] py-[18px] rounded-[6px] w-full">
              <span className="size-[22px] text-[#f26b1d] shrink-0">
                <WarningIcon />
              </span>
              <div className="flex flex-col gap-[5px]">
                <p className="font-bold text-[15px] text-[#1a1a1a] leading-[22px]">
                  3, 7, 12번 슬라이드는 이미지라 AI가 그림으로 읽었습니다
                </p>
                <p className="font-normal text-[14px] text-[#6b7280] leading-[22px]">
                  숫자가 정확하지 않을 수 있습니다. 해당 슬라이드의 핵심 수치는 직접 확인해 주세요.
                </p>
              </div>
            </div>

            <div className="flex gap-[10px] items-start justify-end w-full">
              <button
                type="button"
                onClick={onSkip}
                className="border border-[#e5e7eb] flex h-[50px] items-center px-[20px] rounded-[6px]"
              >
                <span className="font-bold text-[16px] text-[#6b7280] whitespace-nowrap">건너뛰고 실전</span>
              </button>
              <button
                type="button"
                onClick={onStartMock}
                className="bg-[#f26b1d] flex h-[50px] items-center px-[26px] rounded-[6px]"
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
