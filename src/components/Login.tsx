interface LoginProps {
  onLogin: () => void;
  onBack?: () => void; // 랜딩으로 돌아가기
  pendingTitle?: string | null; // 랜딩 슬레이트에 적어둔 발표 이름 (로그인하면 바로 이어진다)
}

// 로그인. 랜딩(슬레이트)에서 발표를 시작하려고 할 때 온다. 무대 위 작은 슬레이트 판 모양.
// 지금은 계정 없이 게스트로 시작한다. 구글, 카카오 로그인은 아직 없어서 눌리지 않게 막아뒀다.
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
              <p className="font-black text-[24px] tracking-[-0.6px]">게스트로 바로 시작해요</p>
              {pendingTitle ? (
                <p className="font-normal text-[14px] text-white/60 leading-[21px]">
                  계정 없이 <span className="font-bold text-white">“{pendingTitle}”</span> 발표 준비로 바로 이어져요.
                </p>
              ) : (
                <p className="font-normal text-[14px] text-white/60 leading-[21px]">계정 없이 바로 발표 준비를 시작할 수 있어요.</p>
              )}
            </div>
            <div className="flex flex-col gap-[10px]">
              <button
                type="button"
                onClick={onLogin}
                className="cta bg-[#f26b1d] hover:bg-[#ff7a2b] transition-colors h-[52px] px-[16px] rounded-[8px] w-full font-bold text-[16px] text-white"
              >
                게스트로 시작하기
              </button>
              <div className="flex items-center gap-[10px] text-[12px] text-white/35">
                <span className="h-px flex-1 bg-white/10" />
                소셜 로그인은 준비 중이에요
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex gap-[12px] h-[46px] items-center px-[16px] rounded-[8px] w-full opacity-40 cursor-not-allowed"
                style={{ backgroundColor: '#ffffff' }}
              >
                <span className="flex items-center justify-center rounded-full size-[22px] border border-[#dadce0]">
                  <span className="font-bold text-[12px]" style={{ color: '#4285f4' }}>G</span>
                </span>
                <span className="flex-1 font-bold text-[15px] text-center" style={{ color: '#3c4043' }}>
                  구글로 계속하기
                </span>
                <span className="w-[22px]" />
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex gap-[12px] h-[46px] items-center px-[16px] rounded-[8px] w-full opacity-40 cursor-not-allowed"
                style={{ backgroundColor: '#fee500' }}
              >
                <span className="flex items-center justify-center size-[22px] font-bold text-[13px]">💬</span>
                <span className="flex-1 font-bold text-[15px] text-center" style={{ color: '#191600' }}>
                  카카오로 계속하기
                </span>
                <span className="w-[22px]" />
              </button>
            </div>
            <p className="font-normal text-[12px] text-white/45 leading-[19px] text-center">
              데모 버전이라 계정 없이 쓸 수 있어요. 올린 자료는 이 서비스를 돌리는 컴퓨터에 저장돼요.
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
