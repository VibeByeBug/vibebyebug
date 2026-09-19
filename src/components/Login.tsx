interface LoginProps {
  onLogin: () => void;
  onBack?: () => void; // 랜딩으로 돌아가기
  pendingTitle?: string | null; // 랜딩 슬레이트에 적어둔 발표 이름 (로그인하면 바로 이어진다)
}

// 로그인. 랜딩(슬레이트)에서 발표를 시작하려고 할 때 온다. 무대 위 작은 슬레이트 판 모양.
// 구글, 카카오 버튼은 아직 실제 인증 없이 넘어가는 자리다.
export function Login({ onLogin, onBack, pendingTitle }: LoginProps) {
  return (
    <div className="relative flex flex-1 min-h-screen w-full items-center justify-center overflow-hidden bg-[#15110d] text-white px-[16px]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(760px 520px at 50% 20%, rgba(255,181,71,0.14), transparent 70%)' }}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[70px] bg-gradient-to-r from-[#4a1712] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[70px] bg-gradient-to-l from-[#4a1712] to-transparent" />

      <div className="relative w-full max-w-[440px] flex flex-col gap-[22px] items-center">
        <button
          type="button"
          onClick={onBack}
          className="font-display text-[34px] tracking-[1.5px] leading-none text-white"
        >
          READY-<span className="text-[#f26b1d]">Q</span>
        </button>

        <div className="w-full">
          <div className="slate-stripes h-[26px] rounded-t-[8px]" />
          <div className="bg-[#111111] rounded-b-[12px] px-[28px] pt-[24px] pb-[26px] flex flex-col gap-[18px] shadow-[0_40px_70px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex flex-col gap-[6px] items-center text-center">
              <p className="font-black text-[24px] tracking-[-0.6px]">로그인하고 시작해요</p>
              {pendingTitle ? (
                <p className="font-normal text-[14px] text-white/60 leading-[21px]">
                  로그인하면 <span className="font-bold text-white">“{pendingTitle}”</span> 발표 준비로 바로 이어져요.
                </p>
              ) : (
                <p className="font-normal text-[14px] text-white/60 leading-[21px]">발표 자료와 연습 기록을 저장해둘게요.</p>
              )}
            </div>
            <div className="flex flex-col gap-[10px]">
              <button
                type="button"
                onClick={onLogin}
                className="bg-white hover:bg-[#f3f3f3] transition-colors flex gap-[12px] h-[52px] items-center px-[16px] rounded-[8px] w-full"
                style={{ backgroundColor: '#ffffff' }}
              >
                <span className="flex items-center justify-center rounded-full size-[22px] border border-[#dadce0]">
                  <span className="font-bold text-[12px]" style={{ color: '#4285f4' }}>G</span>
                </span>
                <span className="flex-1 font-bold text-[16px] text-center" style={{ color: '#3c4043' }}>
                  구글로 계속하기
                </span>
                <span className="w-[22px]" />
              </button>
              <button
                type="button"
                onClick={onLogin}
                className="flex gap-[12px] h-[52px] items-center px-[16px] rounded-[8px] w-full"
                style={{ backgroundColor: '#fee500' }}
              >
                <span className="flex items-center justify-center size-[22px] font-bold text-[13px]">💬</span>
                <span className="flex-1 font-bold text-[16px] text-center" style={{ color: '#191600' }}>
                  카카오로 계속하기
                </span>
                <span className="w-[22px]" />
              </button>
            </div>
            <p className="font-normal text-[12px] text-white/45 leading-[19px] text-center">
              계속하면 이용약관, 개인정보처리방침에 동의하는 것으로 간주합니다.
            </p>
          </div>
        </div>

        {onBack && (
          <button type="button" onClick={onBack} className="font-bold text-[14px] text-white/55 hover:text-white transition-colors">
            ← 처음 화면으로
          </button>
        )}
      </div>
    </div>
  );
}
