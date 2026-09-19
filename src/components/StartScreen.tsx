import { useEffect, useRef, useState } from 'react';
import { mockRecentPresentations } from '../mocks/recentMock';
import { ArrowRightIcon } from './icons';
import { StartGuide } from './StartGuide';

interface StartScreenProps {
  onStart: (title: string) => void;
  onOpenReport: () => void;
  loggedIn?: boolean; // 로그인 전(랜딩)에는 최근 발표와 회고를 숨긴다
}

// 시작 화면 = 검은 무대. 조명이 커서를 천천히 따라오고, 오른쪽 슬레이트 판에 발표 이름이 쓰인다.
// 시작하면 슬레이트 팔이 "딱" 닫힌 뒤 넘어간다. (다른 화면은 흰 배경, 시작 화면만 어둡게)
export function StartScreen({ onStart, onOpenReport, loggedIn = false }: StartScreenProps) {
  const [title, setTitle] = useState('');
  const [snap, setSnap] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

  // 스포트라이트: 커서 위치를 천천히 따라간다 (보간 0.12). 리렌더 없이 CSS 변수만 바꾼다.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tx = 0.7, ty = 0.2, x = tx, y = ty, raf = 0;
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

  // 아래 소개 무대의 "새 발표 준비하기": 맨 위 슬레이트로 올라가 발표 이름 칸에 바로 쓰게 한다
  function backToSlate() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => titleInput.current?.focus(), 500);
  }

  function start() {
    setSnap(true);
    setTimeout(() => onStart(title.trim() || '제목 없는 발표'), 220);
  }

  return (
    <div className="flex flex-col bg-[#15110d]">
    {/* 첫 화면: 화면 높이를 채운다 (헤더 60px + 줄무늬 6px 을 뺀 높이) */}
    <div
      ref={stage}
      className="relative flex min-h-[calc(100vh-66px)] flex-col overflow-hidden bg-[#15110d] text-white"
      style={{ ['--sx' as string]: '70%', ['--sy' as string]: '20%' }}
    >
      {/* 조명과 무대 바닥 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at var(--sx) var(--sy), rgba(255,181,71,0.16), transparent 62%), radial-gradient(900px 220px at 60% 100%, rgba(242,107,29,0.16), transparent 70%)',
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[70px] bg-gradient-to-r from-[#4a1712] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[70px] bg-gradient-to-l from-[#4a1712] to-transparent" />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[160px] opacity-[0.07]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 24px)' }}
      />

      <div className="relative flex flex-1 flex-col lg:flex-row items-center justify-center gap-[72px] lg:gap-[56px] px-[24px] md:px-[96px] pt-[40px] pb-[24px]">
        {/* 왼쪽: 문구와 버튼 */}
        <div className="flex flex-col gap-[20px] max-w-[560px]">
          <p className="font-black text-[44px] leading-[56px] md:text-[68px] md:leading-[86px] tracking-[-2px] break-keep">
            질문이 들어오면,
            <br />
            <span className="text-[#f26b1d]">큐</span>가 뜹니다.
          </p>
          <p className="font-normal text-[17px] leading-[29px] text-white/70">
            발표자료를 올리면 청중 질문에 맞는 근거 슬라이드와 말할 순서를 바로 띄워드려요. 리허설로 모은 설명까지 엮어서
            답합니다.
          </p>
          <div className="flex gap-[12px] pt-[8px]">
            <button
              type="button"
              onClick={start}
              className="bg-[#f26b1d] hover:bg-[#e25c10] transition-colors flex gap-[10px] h-[58px] items-center px-[28px] rounded-[10px]"
            >
              <span className="font-bold text-[18px]">새 발표 준비하기</span>
              <span className="size-[18px]">
                <ArrowRightIcon />
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                loggedIn ? onOpenReport() : document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="border border-white/30 hover:border-white/60 transition-colors h-[58px] px-[24px] rounded-[10px] font-bold text-[18px]"
            >
              {loggedIn ? '지난 발표 회고 보기' : '사용 방법 보기'}
            </button>
          </div>
        </div>

        {/* 오른쪽: 슬레이트 판. PRODUCTION 칸에 발표 이름을 바로 적는다 */}
        <div className="clapper w-full max-w-[480px] select-none mt-[48px] lg:mt-0">
          <div className={`clapper-arm slate-stripes h-[58px] rounded-t-[6px] ${snap ? 'snap' : ''}`} />
          <div className="slate-stripes h-[36px]" />
          <div className="bg-[#111111] rounded-b-[10px] px-[26px] pt-[20px] pb-[18px] flex flex-col gap-[14px] shadow-[0_40px_70px_-20px_rgba(0,0,0,0.8)]">
            <div className="flex flex-col gap-[4px]">
              <span className="font-slate font-medium text-[12px] tracking-[1px] text-white/55">PRODUCTION</span>
              <input
                ref={titleInput}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter') start();
                }}
                placeholder="발표 이름을 적어주세요"
                className="bg-transparent font-hand text-[40px] leading-[44px] text-white placeholder:text-white/30 outline-none w-full border-b border-white/20 focus:border-[#f26b1d] pb-[2px] transition-colors"
              />
            </div>
            <div className="grid grid-cols-3">
              {[
                ['SCENE', 'Q&A'],
                ['TAKE', '1'],
                ['ROLL', '01'],
              ].map(([k, v], i) => (
                <div key={k} className={`flex flex-col gap-[2px] px-[4px] ${i < 2 ? 'border-r border-white/20' : ''} ${i ? 'pl-[16px]' : ''}`}>
                  <span className="font-slate font-medium text-[12px] tracking-[1px] text-white/55">{k}</span>
                  <span className="font-hand text-[56px] leading-[52px] pt-[2px]">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-baseline border-t border-white/20 pt-[10px]">
              <span className="font-slate font-medium text-[12px] tracking-[1px] text-white/55">
                DATE <span className="font-hand text-[26px] tracking-normal text-white ml-[6px]">{today}</span>
              </span>
              <span className="font-slate font-medium text-[12px] tracking-[1px] text-white/55">
                DIRECTOR <span className="font-hand text-[26px] tracking-normal text-white ml-[6px]">발표자</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 최근 발표는 필름 스트립 칸으로 (로그인한 뒤에만) */}
      <div className="relative px-[24px] md:px-[96px] pb-[36px] flex flex-col gap-[10px]">
        {loggedIn && (
        <>
        <p className="font-bold text-[15px] text-white/70">최근 촬영분</p>
        <div className="bg-[#0b0907] rounded-[6px] px-[10px] py-[8px] flex flex-col gap-[8px]">
          <div className="film-holes text-white/20" />
          <div className="flex gap-[10px]">
            {mockRecentPresentations.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={onOpenReport}
                className="flex-1 min-w-0 bg-[#221c16] hover:bg-[#2d251d] transition-colors rounded-[4px] px-[16px] py-[12px] flex flex-col gap-[4px] text-left"
              >
                <span className="font-slate font-semibold text-[12px] tracking-[1px] text-[#f26b1d]">TAKE {i + 1}</span>
                <span className="font-bold text-[16px] truncate">{p.name}</span>
                <span className="text-[12px] text-white/50">{p.date}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={start}
              className="flex-1 min-w-0 border border-dashed border-white/25 hover:border-white/50 transition-colors rounded-[4px] font-bold text-[15px] text-white/60"
            >
              + 새 발표
            </button>
          </div>
          <div className="film-holes text-white/20" />
        </div>
        </>
        )}
        {/* 아래 소개로 내려가는 안내 */}
        <button
          type="button"
          onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
          className="nudge self-center flex flex-col items-center gap-[2px] pt-[14px] text-white/55 hover:text-white transition-colors"
        >
          <span className="font-bold text-[14px]">사용 방법 보기</span>
          <span className="text-[18px] leading-none">↓</span>
        </button>
      </div>
    </div>
    <StartGuide onStart={backToSlate} />
    </div>
  );
}
