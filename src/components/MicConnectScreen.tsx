import { MicLargeIcon } from './icons';

interface MicConnectScreenProps {
  onConnect: () => void;
}

export function MicConnectScreen({ onConnect }: MicConnectScreenProps) {
  return (
    <div className="flex flex-1 flex-col gap-[28px] items-center justify-center pb-[36px] pt-[32px] px-[44px] w-full">
      <div className="bg-[#f2f2f2] flex items-center justify-center rounded-full shrink-0 size-[160px]">
        <span className="size-[64px] text-[#4d4d4d]">
          <MicLargeIcon />
        </span>
      </div>
      <div className="bg-[#f2f2f2] flex gap-[6px] items-center px-[14px] py-[7px] rounded-full">
        <span className="bg-[#22c55e] rounded-full size-[8px]" />
        <p className="font-bold text-[13px] text-black whitespace-nowrap">마이크 권한: 허용됨</p>
      </div>
      <p className="font-bold text-[30px] text-black whitespace-nowrap">마이크를 연결해주세요</p>
      <p className="font-normal text-[16px] text-[#808080] whitespace-nowrap">
        연결하면 실시간으로 질문을 듣고 답변을 준비해요
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="bg-[#f26b1d] flex h-[56px] items-center justify-center rounded-[28px] w-[200px]"
      >
        <span className="font-bold text-[18px] text-white">연결하기</span>
      </button>
    </div>
  );
}
