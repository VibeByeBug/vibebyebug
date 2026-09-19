import { useState } from 'react';

// 슬라이드 내용. AI 가 읽기 좋게 정리한 글이 있으면 그걸 먼저 보여주고, 원문으로 바꿔 볼 수 있다.
// 정리본은 보여주기용이다. 검색과 답변 근거는 원문을 쓴다.
export function SlideText({ raw, refined, pending }: { raw: string; refined?: string | null; pending?: boolean }) {
  const [showRaw, setShowRaw] = useState(false);
  const useRefined = !!refined && !showRaw;
  return (
    <div className="flex flex-col gap-[8px]">
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
      {useRefined ? <Refined text={refined!} /> : (
        <p className="font-normal text-[13px] text-[#374151] leading-[21px] whitespace-pre-line">{raw}</p>
      )}
    </div>
  );
}

function Refined({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <div className="flex flex-col gap-[3px]">
      {lines.map((l, i) => {
        const t = l.trim();
        if (i === 0 && !t.startsWith('-') && !t.startsWith('#'))
          return (
            <p key={i} className="font-bold text-[15px] text-[#1a1a1a] leading-[22px] mb-[4px]">
              {t}
            </p>
          );
        if (t.startsWith('#'))
          return (
            <p key={i} className="font-bold text-[13px] text-[#f26b1d] leading-[20px] mt-[8px]">
              {t.replace(/^#+\s*/, '')}
            </p>
          );
        if (t.startsWith('-'))
          return (
            <p key={i} className="flex gap-[7px] font-normal text-[13px] text-[#374151] leading-[20px]">
              <span className="text-[#c4c8cf] shrink-0">•</span>
              <span className="break-keep">{t.replace(/^-\s*/, '')}</span>
            </p>
          );
        return (
          <p key={i} className="font-medium text-[13px] text-[#374151] leading-[20px]">
            {t}
          </p>
        );
      })}
    </div>
  );
}
