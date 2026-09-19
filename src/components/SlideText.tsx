import { useState } from 'react';

// 슬라이드 내용. AI 가 읽기 좋게 정리한 글이 있으면 그걸 먼저 보여주고, 원문으로 바꿔 볼 수 있다.
// 정리본은 보여주기용이다. 검색과 답변 근거는 원문을 쓴다.
// showRaw 를 넘기면 원문, 정리본 전환은 부모가 맡는다 (리허설 화면은 전환 버튼을 카드 머리에 둔다).
export function SlideText({
  raw,
  refined,
  pending,
  dark,
  showRaw: showRawProp,
}: {
  raw: string;
  refined?: string | null;
  pending?: boolean;
  dark?: boolean;
  showRaw?: boolean;
}) {
  const [showRawOwn, setShowRaw] = useState(false);
  const controlled = showRawProp !== undefined;
  const showRaw = controlled ? showRawProp : showRawOwn;
  const useRefined = !!refined && !showRaw;
  return (
    <div className="flex flex-col gap-[8px]">
      {!controlled && (
        <div className="flex items-center gap-[8px]">
          {refined ? (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="font-bold text-[11px] text-[#6b7280] border border-[#e5e7eb] rounded-full px-[8px] h-[22px] bg-white"
            >
              {showRaw ? 'AI 정리본 보기' : 'PDF 원문 보기'}
            </button>
          ) : (
            pending && <span className="font-medium text-[11px] text-[#9ca3af]">읽기 좋게 정리하는 중···</span>
          )}
        </div>
      )}
      {useRefined ? (
        <Refined text={refined!} dark={dark} />
      ) : dark ? (
        <p className="font-normal text-[15px] text-white/75 leading-[25px] whitespace-pre-line">{raw}</p>
      ) : (
        <p className="font-normal text-[13px] text-[#374151] leading-[21px] whitespace-pre-line">{raw}</p>
      )}
    </div>
  );
}

// 무대(검정) 화면용 글자 크기와 색. 흰 화면용은 지식 지도 옆 패널에서 그대로 쓴다.
const TONE = {
  light: {
    head: 'font-bold text-[15px] text-[#1a1a1a] leading-[22px] mb-[4px]',
    section: 'font-bold text-[13px] text-[#f26b1d] leading-[20px] mt-[8px]',
    bullet: 'flex gap-[7px] font-normal text-[13px] text-[#374151] leading-[20px]',
    dot: 'text-[#c4c8cf] shrink-0',
    body: 'font-medium text-[13px] text-[#374151] leading-[20px]',
  },
  dark: {
    head: 'font-black text-[21px] text-white leading-[31px] tracking-[-0.3px] mb-[6px] break-keep',
    section: 'font-mono font-bold text-[12px] text-[#f26b1d] tracking-[1px] leading-[18px] mt-[14px] mb-[2px]',
    bullet: 'flex gap-[9px] font-normal text-[15px] text-white/80 leading-[24px]',
    dot: 'text-white/30 shrink-0',
    body: 'font-medium text-[15px] text-white/80 leading-[24px]',
  },
};

function Refined({ text, dark }: { text: string; dark?: boolean }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const c = dark ? TONE.dark : TONE.light;
  return (
    <div className="flex flex-col gap-[3px]">
      {lines.map((l, i) => {
        const t = l.trim();
        if (i === 0 && !t.startsWith('-') && !t.startsWith('#'))
          return (
            <p key={i} className={c.head}>
              {t}
            </p>
          );
        if (t.startsWith('#'))
          return (
            <p key={i} className={c.section}>
              {t.replace(/^#+\s*/, '')}
            </p>
          );
        if (t.startsWith('-'))
          return (
            <p key={i} className={c.bullet}>
              <span className={c.dot}>•</span>
              <span className="break-keep">{t.replace(/^-\s*/, '')}</span>
            </p>
          );
        return (
          <p key={i} className={c.body}>
            {t}
          </p>
        );
      })}
    </div>
  );
}
