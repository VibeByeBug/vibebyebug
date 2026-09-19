interface RecognizedQuestionProps {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}

export function RecognizedQuestion({ partialText, finalText, isConfirmed }: RecognizedQuestionProps) {
  const text = isConfirmed ? finalText : partialText;

  return (
    // 실전 화면과 같은 검은 무대. 질문을 받아 적는 동안 가운데에 크게 보여준다.
    <div className="relative flex flex-1 flex-col items-center justify-center pb-[36px] pt-[32px] px-[44px] w-full bg-[#15110d] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% -120px, rgba(255,181,71,0.13), transparent 70%)' }}
      />
      <div className="relative flex flex-col gap-[16px] items-center text-center w-full max-w-[1100px]">
        <p className="font-bold text-[15px] text-white/55">질문을 듣고 있어요</p>
        <p
          className={`font-black text-[44px] tracking-[-1.6px] leading-[57px] w-full break-keep ${
            isConfirmed ? 'text-white' : 'text-white/45'
          }`}
        >
          {text || '질문을 기다리고 있어요···'}
        </p>
        <div className="flex gap-[4px] items-center h-[24px]" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="wave-bar w-[4px] h-[22px] rounded-full bg-[#e5322d]"
              style={{ animationDelay: `${i * 110}ms` }}
            />
          ))}
        </div>
        <p className="font-normal text-[13px] text-white/40">질문 유형은 인식이 끝나면 분류돼요</p>
      </div>
    </div>
  );
}
