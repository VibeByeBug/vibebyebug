import { useEffect, useRef } from 'react';
import { useTheme } from '../theme';
import { DEFAULT_TITLE } from '../constants';

interface LoginProps {
  onLogin: () => void;
  onBack?: () => void; // 랜딩으로 돌아가기
  pendingTitle?: string | null; // 랜딩 슬레이트에 적어둔 발표 이름 (로그인하면 바로 이어진다)
}

// 로그인. 랜딩(슬레이트)에서 발표를 시작하려고 할 때 온다. 무대 위 작은 슬레이트 판 모양.
// 지금은 게스트로만 들어간다. 구글, 카카오는 실제 인증이 없어 눌리지 않게 막아뒀다(화면에는 설명을 적지 않는다).
// 인증을 붙일 때 그 두 버튼의 disabled 를 풀고 onClick 을 연결한다.
export function Login({ onLogin, onBack, pendingTitle }: LoginProps) {
  // 라이트 모드: 무대 바닥은 종이, 글자는 잉크. 슬레이트 판은 소품이라 검은 판에 흰 글씨 그대로.
  const light = useTheme().theme === 'light';
  const stage = useRef<HTMLDivElement>(null);

  // 스포트라이트: 시작 화면과 같은 방식으로 커서를 천천히 따라간다 (리렌더 없이 CSS 변수만 바꾼다)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tx = 0.5, ty = 0.2, x = tx, y = ty, raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
    };
    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.setProperty('--sx', `${x * 100}%`);
      el.style.setProperty('--sy', `${y * 100}%`);
      raf = requestAnimationFrame(tick);
    };
    if (!reduce) {
      el.addEventListener('mousemove', onMove);
      raf = requestAnimationFrame(tick);
    }
    return () => {
      el.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={stage}
      className="relative flex flex-1 min-h-screen w-full items-center justify-center overflow-hidden bg-page text-ink px-[16px]"
      style={{ ['--sx' as string]: '50%', ['--sy' as string]: '20%' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(620px circle at var(--sx) var(--sy), rgba(255,181,71,${light ? 0.32 : 0.16}), transparent 62%)`,
        }}
      />
      {!light && <div className="stage-grain pointer-events-none absolute inset-0" />}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 w-[70px] bg-gradient-to-r to-transparent ${
          light ? 'from-slateInk/[0.06]' : 'from-[#4a1712]'
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 w-[70px] bg-gradient-to-l to-transparent ${
          light ? 'from-slateInk/[0.06]' : 'from-[#4a1712]'
        }`}
      />

      <div className="relative w-full max-w-[440px] flex flex-col gap-[22px] items-center">
        <button
          type="button"
          onClick={onBack}
          className="font-display text-[34px] tracking-[1.5px] leading-none text-ink"
        >
          READY-<span className="text-[#f26b1d]">Q</span>
        </button>

        <div
          className="tilt w-full"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const dx = (e.clientX - r.left) / r.width - 0.5;
            const dy = (e.clientY - r.top) / r.height - 0.5;
            e.currentTarget.style.setProperty('--ry', `${dx * 8}deg`);
            e.currentTarget.style.setProperty('--rx', `${-dy * 6}deg`);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.setProperty('--ry', '0deg');
            e.currentTarget.style.setProperty('--rx', '0deg');
          }}
        >
          <div className="slate-stripes h-[26px] rounded-t-[8px]" />
          <div className="bg-[#111111] text-white rounded-b-[12px] px-[28px] pt-[24px] pb-[26px] flex flex-col gap-[18px] shadow-[0_40px_70px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex flex-col gap-[6px] items-center text-center">
              <p className="font-black text-[24px] tracking-[-0.6px]">발표 준비를 시작해요</p>
              {/* 발표 이름을 적어서 온 경우에만 보여준다. 기본 이름은 안내가 되지 않는다 */}
              {pendingTitle && pendingTitle !== DEFAULT_TITLE && (
                <p className="font-bold text-[15px] text-white/70 leading-[22px] break-keep">“{pendingTitle}”</p>
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
                또는
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <button
                type="button"
                disabled
                title="준비 중이에요"
                className="flex gap-[12px] h-[52px] items-center px-[16px] rounded-[8px] w-full opacity-40 cursor-not-allowed"
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
                disabled
                title="준비 중이에요"
                className="flex gap-[12px] h-[52px] items-center px-[16px] rounded-[8px] w-full opacity-40 cursor-not-allowed"
                style={{ backgroundColor: '#fee500' }}
              >
                <span className="flex items-center justify-center size-[22px] font-bold text-[13px]">💬</span>
                <span className="flex-1 font-bold text-[16px] text-center" style={{ color: '#191600' }}>
                  카카오로 계속하기
                </span>
                <span className="w-[22px]" />
              </button>
            </div>
          </div>
        </div>

        {onBack && (
          <button type="button" onClick={onBack} className="font-bold text-[14px] text-ink/55 hover:text-ink transition-colors">
            ← 처음 화면으로
          </button>
        )}
      </div>
    </div>
  );
}
