import { DocumentIcon, RefreshIcon, WarningIcon } from './icons';

interface UploadFailedScreenProps {
  onBackToList: () => void;
  onRetry: () => void;
}

export function UploadFailedScreen({ onBackToList, onRetry }: UploadFailedScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center py-[44px] w-full">
      <div className="flex flex-col gap-[26px] w-[880px]">
        <div className="flex flex-col gap-[7px] w-full">
          <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px] w-full">
            자료 업로드에 실패했어요
          </p>
          <p className="font-normal text-[15px] text-[#6b7280] w-full">
            PDF 파싱 중 오류가 발생했습니다. 파일을 확인하고 다시 시도해주세요.
          </p>
        </div>

        <div className="border border-[#e5e7eb] flex gap-[18px] items-center p-[26px] rounded-[6px] w-full">
          <span className="size-[40px] text-[#bf382e] shrink-0">
            <DocumentIcon />
          </span>
          <div className="flex flex-col flex-1 gap-[5px] min-w-0">
            <p className="font-bold text-[17px] text-[#1a1a1a] w-full">capstone_final.pdf</p>
            <p className="font-normal text-[14px] text-[#bf382e] w-full">18.4MB · 업로드 실패 (오류 코드: UPLOAD_500)</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="border border-[#e5e7eb] flex gap-[7px] h-[40px] items-center px-[16px] rounded-[6px] shrink-0"
          >
            <span className="size-[16px] text-[#1a1a1a]">
              <RefreshIcon />
            </span>
            <span className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">다른 파일 선택</span>
          </button>
        </div>

        <div className="border border-[#e5e7eb] flex flex-col gap-[14px] px-[26px] py-[24px] rounded-[6px] w-full">
          <p className="font-bold text-[15px] text-[#1a1a1a] w-full">실패 원인</p>
          <div className="flex gap-[16px] items-center w-full">
            <span className="bg-[#fae5e0] flex items-center justify-center rounded-full shrink-0 size-[41px]">
              <span className="font-bold text-[20px] text-[#bf382e]">!</span>
            </span>
            <div className="flex flex-1 flex-col gap-[6px] min-w-0">
              <p className="font-bold text-[16px] text-black w-full">서버에서 파일 처리에 실패했습니다</p>
              <p className="font-normal text-[13px] text-[#666] w-full">
                네트워크 상태를 확인하고 다시 시도해주세요. 계속 실패하면 파일을 PDF로 변환해서 업로드해보세요.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#fff3eb] border border-[#f26b1d] flex gap-[12px] items-start px-[20px] py-[18px] rounded-[6px] w-full">
          <span className="size-[22px] text-[#f26b1d] shrink-0">
            <WarningIcon />
          </span>
          <div className="flex flex-col gap-[5px]">
            <p className="font-bold text-[15px] text-[#1a1a1a] leading-[22px]">이런 경우 도움이 될 수 있어요</p>
            <p className="font-normal text-[14px] text-[#6b7280] leading-[22px] w-[481px]">
              파일을 새로 저장한 뒤 다시 업로드하거나, PDF로 변환해서 올려보세요.
            </p>
          </div>
        </div>

        <div className="flex gap-[10px] items-start justify-end w-full">
          <button
            type="button"
            onClick={onBackToList}
            className="border border-[#e5e7eb] flex h-[50px] items-center px-[20px] rounded-[6px]"
          >
            <span className="font-bold text-[16px] text-[#6b7280] whitespace-nowrap">발표 목록으로</span>
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="bg-[#f26b1d] flex h-[50px] items-center px-[26px] rounded-[6px]"
          >
            <span className="font-bold text-[16px] text-white whitespace-nowrap">다시 시도</span>
          </button>
        </div>
      </div>
    </div>
  );
}
