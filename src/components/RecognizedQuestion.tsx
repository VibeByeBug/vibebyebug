interface RecognizedQuestionProps {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}

export function RecognizedQuestion({ partialText, finalText, isConfirmed }: RecognizedQuestionProps) {
  const text = isConfirmed ? finalText : partialText;

  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-[36px] pt-[32px] px-[44px] w-full">
      <div className="flex flex-col gap-[16px] w-full">
        <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">질문 인식 중···</p>
        <p
          className={`font-bold text-[44px] tracking-[-1.76px] leading-[57px] w-full ${
            isConfirmed ? 'text-[#1a1a1a]' : 'text-[#999]'
          }`}
        >
          {text || '질문을 기다리고 있어요···'}
        </p>
        <p className="font-normal text-[13px] text-[#999] whitespace-nowrap">질문 유형은 인식이 끝나면 분류돼요</p>
      </div>
    </div>
  );
}
