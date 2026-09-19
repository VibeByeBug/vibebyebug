interface RecognizedQuestionProps {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
  listening?: boolean;
  missed?: boolean; // 질문을 끝냈는데 알아들은 말이 없었다
  onToggle?: () => void;
}

// 질문 받는 화면. 발표자가 켜고 끈다.
//   대기    질문이 시작되면 "질문 듣기" 또는 Space
//   듣는 중  들은 말을 흐리게 쌓아 보여주고, 질문이 끝나면 "질문 끝" 또는 Space
//   보냄    군말을 걷어낸 질문을 또렷하게 보여주고 실전 화면으로 넘어간다
export function RecognizedQuestion({
  partialText,
  finalText,
  isConfirmed,
  listening = false,
  missed = false,
  onToggle,
}: RecognizedQuestionProps) {
  const text = isConfirmed ? finalText : partialText;
  const waiting = !listening && !isConfirmed;

  return (
    // 실전 화면과 같은 검은 무대. 질문을 받아 적는 동안 가운데에 크게 보여준다.
    <div className="relative flex flex-1 flex-col items-center justify-center pb-[36px] pt-[32px] px-[16px] sm:px-[44px] w-full bg-[#15110d] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% -120px, rgba(255,181,71,0.13), transparent 70%)' }}
      />
      <div className="relative flex flex-col gap-[18px] items-center text-center w-full max-w-[1100px]">
        <p className={`font-bold text-[15px] ${listening ? 'text-[#ff7a70]' : 'text-white/55'}`}>
          {listening ? '질문을 듣고 있어요' : isConfirmed ? '이 질문으로 찾고 있어요' : '질문 대기'}
        </p>

        {waiting ? (
          <p className="font-black text-[38px] sm:text-[44px] tracking-[-1.4px] leading-[1.3] text-white/85 break-keep">
            {missed ? '말을 알아듣지 못했어요. 다시 들어볼까요?' : '질문이 시작되면 마이크를 켜세요'}
          </p>
        ) : (
          <p
            className={`font-black text-[38px] sm:text-[44px] tracking-[-1.4px] leading-[1.3] w-full break-keep ${
              isConfirmed ? 'text-white' : 'text-white/50'
            }`}
          >
            {text || '말씀하시면 여기에 받아 적어요···'}
          </p>
        )}

        {listening && (
          <div className="flex gap-[4px] items-center h-[24px]" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="wave-bar w-[4px] h-[22px] rounded-full bg-[#e5322d]"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </div>
        )}

        {!isConfirmed && onToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur(); // 포커스가 남으면 다음 Space 가 이 버튼을 한 번 더 누른다
              onToggle();
            }}
            className={`cta mt-[6px] flex items-center gap-[10px] h-[56px] px-[28px] rounded-full font-bold text-[18px] text-white ${
              listening ? 'bg-[#e5322d]' : 'bg-[#f26b1d]'
            }`}
          >
            <span className={`size-[12px] bg-white ${listening ? 'rounded-[2px]' : 'rounded-full'}`} />
            {listening ? '질문 끝' : '질문 듣기'}
            <kbd className="font-mono text-[13px] text-white/70 border border-white/35 rounded-[4px] px-[6px] py-[1px]">Space</kbd>
          </button>
        )}

        <p className="font-normal text-[13px] text-white/40 break-keep">
          {listening
            ? '말이 잠깐 끊겨도 계속 받아 적어요. 질문이 다 끝나면 눌러주세요. "어", "음" 같은 군말은 빼고 찾아요.'
            : isConfirmed
              ? '"어", "음" 같은 군말과 인사말은 빼고 찾아요'
              : '청중이 질문을 시작할 때 켜고, 질문이 끝나면 끄세요'}
        </p>
      </div>
    </div>
  );
}
