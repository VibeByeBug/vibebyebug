import { useEffect, useRef, useState } from 'react';
import type { FlowStep } from '../types/qa';
import { FlowSteps } from './Hud';

// 시작 화면 아래 소개 무대. 스크롤해서 무대가 보이면 커튼이 양옆으로 걷히고,
// 어떤 사이트인지와 사용 방법이 차례로 나온다.

const SCENES = [
  {
    no: '01',
    title: '대본 입고',
    what: '발표자료(PDF)를 올려요.',
    detail: '글자가 없는 이미지 슬라이드도 읽고, 흩어진 표와 카드를 읽기 좋게 정리해요.',
  },
  {
    no: '02',
    title: '리허설',
    what: '발표하듯 말하거나 대본, 설명 자료를 올려요.',
    detail: '슬라이드에 이미 있는 말은 거르고, 슬라이드에 없는 이유와 배경만 모아요.',
  },
  {
    no: '03',
    title: 'ON AIR',
    what: '청중 질문을 들으면 바로 띄워요.',
    detail: '근거 슬라이드는 1초 안에 뜨고, 추천 답변은 2~4초, 말할 순서는 그 뒤에 이어서 떠요.',
  },
  {
    no: '04',
    title: '콘티 보드',
    what: '발표 지식을 주제별로 이은 지도를 봐요.',
    detail: '어떤 질문에 무엇을 엮어 답할지, 설명이 모자란 곳이 어디인지 미리 확인해요.',
  },
];

// 실전 화면 예시에 쓸 샷 카드 (Ready-Q 발표자료와 설명 자료로 실제로 만든 답을 옮겼다)
const DEMO_STEPS: FlowStep[] = [
  {
    text: '근거부터 1초 안에',
    slide: 6,
    keys: ['근거 슬라이드', '1초'],
    detail: '질문을 듣고 화면으로 눈을 돌리는 시간이 1초라, 근거 슬라이드를 먼저 띄우고 답변은 이어서 채웁니다.',
    link: '그래서',
    why: '먼저 띄울 것을 고른 기준',
  },
  {
    text: '빠른 하이브리드 검색',
    slide: 8,
    keys: ['하이브리드', 'e5-small'],
    detail: '더 정확한 모델은 느릴 때 2초가 넘어서, 정확도를 조금 내주고 e5-small 하이브리드를 골랐습니다. 근거 검색은 1초 안에 끝납니다.',
    link: '덧붙이면',
    why: '화면 흔들림 제거',
  },
  {
    text: '답변과 순서는 같이',
    slide: 6,
    keys: ['추천 답변 2~4초', '동시 생성'],
    detail: '추천 답변과 말할 순서를 동시에 만들어서, 답변이 뜬 뒤 순서를 따로 기다리지 않습니다.',
  },
];

export function StartGuide({ onStart }: { onStart: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // 무대가 화면에 30% 이상 들어오면 커튼을 걷는다. 한 번 걷히면 그대로 둔다.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOpen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 등장(opacity, transform)만 늦게 시작하고, 마우스 반응(translate 등)은 바로 움직이게 한다
  const delay = (ms: number) => ({ transitionDelay: open ? `${ms}ms, ${ms}ms, 0ms, 0ms, 0ms` : '0ms' });

  return (
    <section
      id="how-it-works"
      ref={stage}
      className={`curtain-stage relative overflow-hidden bg-[#15110d] text-white ${open ? 'open' : ''}`}
    >
      <div className="curtain-valance" />
      <div className="curtain curtain-left" />
      <div className="curtain curtain-right" />
      {/* 무대 조명 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 520px at 50% 60px, rgba(255,181,71,0.14), transparent 70%), radial-gradient(1000px 260px at 50% 100%, rgba(242,107,29,0.14), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-[56px] px-[24px] md:px-[96px] pt-[120px] pb-[110px]">
        {/* 어떤 사이트인지 */}
        <div className="reveal flex flex-col items-center gap-[14px] text-center max-w-[820px]" style={delay(700)}>
          <p className="font-black text-[44px] tracking-[-1.4px] leading-[56px] break-keep">
            발표 Q&amp;A 를 촬영하듯 준비하세요
          </p>
          <p className="font-normal text-[17px] leading-[29px] text-white/70 break-keep">
            Ready-Q 는 발표자료와 대본, 설명 자료를 미리 읽어두었다가 청중 질문이 들어오면 근거 슬라이드와 말할 순서를
            바로 띄워주는 발표 Q&amp;A 프롬프터예요. 자료에 없는 내용은 지어내지 않고, 추론한 답은 따로 표시해요.
          </p>
        </div>

        {/* 사용 방법 4단계: 필름 스트립 칸 */}
        <div className="reveal w-full max-w-[1200px] bg-[#0b0907] rounded-[8px] px-[12px] py-[10px] flex flex-col gap-[10px]" style={delay(900)}>
          <div className="film-holes text-white/20" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[10px]">
            {SCENES.map((s, i) => (
              <div
                key={s.no}
                className="reveal scene-card lift bg-[#221c16] hover:bg-[#2a221b] rounded-[6px] px-[18px] py-[18px] flex flex-col gap-[8px] items-center text-center"
                style={delay(1000 + i * 140)}
              >
                <span className="scene-no font-display text-[44px] leading-none text-[#f26b1d]">{s.no}</span>
                <span className="font-black text-[26px] leading-[32px] tracking-[-0.6px]">{s.title}</span>
                <span className="font-bold text-[15px] leading-[22px] break-keep">{s.what}</span>
                <span className="font-normal text-[13px] leading-[20px] text-white/60 break-keep">{s.detail}</span>
              </div>
            ))}
          </div>
          <div className="film-holes text-white/20" />
        </div>

        {/* 실전 화면 예시 */}
        <div className="reveal flex flex-col items-center gap-[22px] w-full max-w-[1200px] mt-[72px]" style={delay(1600)}>
          <div className="flex flex-col items-center gap-[10px] text-center">
            <p className="font-black text-[34px] tracking-[-1px] break-keep">실전에서는 이렇게 떠요</p>
            <p className="font-normal text-[16px] text-white/60 break-keep">
              청중이 “응답 시간을 지키려고 어떤 선택을 했나요?” 라고 물으면, 질문이 끝나고 말할 순서가 칸으로 떠요.
            </p>
          </div>
          <FlowSteps steps={DEMO_STEPS} dark />
        </div>

        <button
          type="button"
          onClick={onStart}
          className="reveal cta bg-[#f26b1d] hover:bg-[#e25c10] h-[58px] px-[34px] rounded-[10px] font-bold text-[18px]"
          style={delay(1800)}
        >
          새 발표 준비하기
        </button>
      </div>
    </section>
  );
}
