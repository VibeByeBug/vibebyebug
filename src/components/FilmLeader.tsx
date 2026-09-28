import { useEffect, useRef, useState } from 'react';

// 옛날 영화 필름 앞에 붙는 "리더" 카운트다운(3·2·1). 사이트를 처음 열 때 한 번만 돈다.
// 세션당 한 번(다시 열 때마다 보이면 거슬린다), 아무 데나 누르면 바로 건너뛴다.
// 움직임을 줄이는 설정이면 아예 띄우지 않는다.

const SEEN_KEY = 'readyq-seen-leader';
const NUMS = [3, 2, 1] as const;
const STEP_MS = 620; // 숫자 하나당 시간
const OUT_MS = 620; // 다 세고 나서 홍채(iris)처럼 닫히는 시간

function initialVisible(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 안 띄운다 — 매번 다시 도는 것보다 안전하다
  }
}

export function FilmLeader() {
  const [visible, setVisible] = useState(initialVisible);
  const [step, setStep] = useState(0); // NUMS[step] 을 보여준다. NUMS.length 에 닿으면 다 센 것
  const [closing, setClosing] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 못 남겨도 이번 재생은 그대로 둔다
    }
    const tick = window.setInterval(() => setStep((s) => Math.min(s + 1, NUMS.length)), STEP_MS);
    const closeAt = window.setTimeout(() => setClosing(true), NUMS.length * STEP_MS);
    const goneAt = window.setTimeout(() => setVisible(false), NUMS.length * STEP_MS + OUT_MS);
    timers.current = [closeAt, goneAt];
    return () => {
      clearInterval(tick);
      timers.current.forEach(clearTimeout);
    };
  }, [visible]);

  function skip() {
    clearAllTimers();
    setClosing(true);
    const t = window.setTimeout(() => setVisible(false), OUT_MS);
    timers.current.push(t);
  }

  function clearAllTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  if (!visible) return null;
  const n = NUMS[Math.min(step, NUMS.length - 1)];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="건너뛰기"
      onClick={skip}
      onKeyDown={skip}
      className={`film-leader fixed inset-0 z-[999] grid place-items-center bg-black cursor-pointer ${closing ? 'film-leader-out' : ''}`}
    >
      <div className="stage-grain pointer-events-none absolute inset-0" />
      <div className="film-scratches pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center gap-[18px]">
        <div className="relative grid size-[168px] place-items-center rounded-full border-2 border-white/50">
          <span key={n} className="leader-count font-display text-[92px] leading-none text-white">
            {n}
          </span>
          <span key={`sweep-${n}`} className="leader-sweep absolute inset-[-2px] rounded-full" />
        </div>
        <p className="font-mono font-bold text-[12px] tracking-[4px] text-white/40">READY · Q</p>
      </div>
      <span className="absolute bottom-[28px] font-mono text-[11px] text-white/25">눌러서 건너뛰기</span>
    </div>
  );
}
