interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  return (
    <div className="flex items-stretch min-h-screen w-full">
      <div className="bg-[#fafafa] border-r border-[#e5e7eb] flex items-center justify-center p-[64px] shrink-0 w-[720px]">
        <div className="bg-white border border-[#e5e7eb] flex flex-col rounded-[6px] w-[560px] overflow-hidden">
          <div className="border-b border-[#e5e7eb] flex gap-[6px] h-[34px] items-center px-[12px]">
            <span className="bg-[#e5e7eb] rounded-full size-[8px]" />
            <span className="bg-[#e5e7eb] rounded-full size-[8px]" />
            <span className="bg-[#e5e7eb] rounded-full size-[8px]" />
          </div>
          <div className="flex items-start">
            <div className="flex-1 p-[18px]">
              <div className="bg-[#f3f4f6] border border-[#e5e7eb] flex h-[210px] items-center justify-center rounded-[6px]">
                <p className="font-medium text-[10px] text-[#9ca3af] whitespace-nowrap">발표 슬라이드 캡처</p>
              </div>
            </div>
            <div className="border-l border-[#e5e7eb] flex flex-col gap-[10px] p-[18px] w-[212px]">
              <div className="flex items-center justify-between w-full">
                <span className="bg-[#fff3eb] border border-[#f26b1d] flex px-[8px] py-[3px] rounded-full">
                  <span className="font-bold text-[9px] text-[#f26b1d] whitespace-nowrap">한계반론</span>
                </span>
                <span className="font-mono font-bold text-[9px] text-[#6b7280] whitespace-nowrap">428ms</span>
              </div>
              <p className="font-bold text-[13px] text-[#1a1a1a] leading-[18px] w-full">AI 성능이 어느 정도 나왔나요?</p>
              <div className="flex flex-wrap gap-[4px] w-full">
                <span className="border border-[#e5e7eb] px-[8px] py-[4px] rounded-full">
                  <span className="font-bold text-[10px] text-[#1a1a1a] whitespace-nowrap">33,000장</span>
                </span>
                <span className="border border-[#e5e7eb] px-[8px] py-[4px] rounded-full">
                  <span className="font-bold text-[10px] text-[#1a1a1a] whitespace-nowrap">0.96</span>
                </span>
              </div>
              <div className="border border-[#e5e7eb] flex flex-col gap-[4px] p-[9px] rounded-[6px] w-full">
                <p className="font-black text-[15px] text-[#1a1a1a] w-full">p.11</p>
                <p className="font-normal text-[10px] text-[#6b7280] leading-[15px] w-full">
                  사진 33,000장으로 학습, 3,300장으로 평가
                </p>
              </div>
              <div className="border border-[#e5e7eb] flex flex-col gap-[4px] p-[9px] rounded-[6px] w-full">
                <p className="font-black text-[15px] text-[#1a1a1a] w-full">p.12</p>
                <p className="font-normal text-[10px] text-[#6b7280] leading-[15px] w-full">토사퇴적(DS) 확신도 0.96</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col gap-[36px] w-[400px]">
          <div className="flex flex-col gap-[10px] text-center w-full">
            <p className="font-black text-[28px] text-[#1a1a1a] tracking-[-1.12px]">
              Ready-<span className="text-[#f26b1d]">Q</span>
            </p>
            <p className="font-normal text-[15px] text-[#6b7280] leading-[24px] w-full">
              질문이 두렵지 않게, 근거는 Ready-Q가
            </p>
          </div>
          <div className="flex flex-col gap-[10px] w-full">
            <button
              type="button"
              onClick={onLogin}
              className="bg-white border border-[#dadce0] flex gap-[12px] h-[52px] items-center px-[16px] rounded-[6px] w-full"
            >
              <span className="border border-[#dadce0] flex items-center justify-center rounded-[6px] size-[20px]">
                <span className="font-bold text-[11px] text-[#6b7280]">G</span>
              </span>
              <span className="flex-1 font-bold text-[16px] text-[#3c4043] text-center">구글로 계속하기</span>
              <span className="w-[20px]" />
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="bg-[#fee500] border border-[#fee500] flex gap-[12px] h-[52px] items-center px-[16px] rounded-[6px] w-full"
            >
              <span className="flex items-center justify-center size-[20px]">
                <span className="font-bold text-[13px]">💬</span>
              </span>
              <span className="flex-1 font-bold text-[16px] text-[#191600] text-center">카카오로 계속하기</span>
              <span className="w-[20px]" />
            </button>
          </div>
          <p className="font-normal text-[12px] text-[#6b7280] leading-[19px] text-center w-full">
            계속하면 이용약관, 개인정보처리방침에 동의하는 것으로 간주합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
