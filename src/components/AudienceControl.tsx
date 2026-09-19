// 발표자 화면 위쪽의 청중 화면 조종 줄.
// 근거 슬라이드 후보를 번호로 보여주고, 누르거나 숫자키를 누른 것만 청중 화면(프로젝터)에 보낸다.
// 자동으로 보내지 않는다: 엉뚱한 슬라이드가 청중에게 뜨면 발표 전체의 신뢰가 깎인다.

export interface AudienceCandidate {
  page: number;
  quote: string;
}

export function AudienceControl({
  candidates,
  current,
  open,
  onOpen,
  onSend,
  onClear,
}: {
  candidates: AudienceCandidate[];
  current: number | null; // 청중 화면에 떠 있는 슬라이드 번호
  open: boolean; // 청중 화면 창이 열려 있나
  onOpen: () => void;
  onSend: (i: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-full border-b border-white/10 bg-[#0f0c09]">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-[8px] px-[16px] py-[8px]">
        <span className="flex items-center gap-[7px] text-[13px] font-bold text-white/70">
          <span className={`size-[8px] rounded-full ${open ? (current ? 'bg-[#e5322d] tally-pulse' : 'bg-[#58d68d]') : 'bg-white/25'}`} />
          청중 화면
          <span className="font-medium text-white/45">
            {!open ? '닫힘' : current ? `p.${current} 띄우는 중` : '대기 (Q&A 슬레이트)'}
          </span>
        </span>

        {!open ? (
          <button
            type="button"
            onClick={onOpen}
            className="cta ml-[6px] h-[30px] rounded-full bg-[#f26b1d] px-[14px] text-[13px] font-bold text-white"
          >
            청중 화면 열기
          </button>
        ) : (
          <>
            <span className="mx-[4px] h-[16px] w-px bg-white/15" />
            {candidates.length === 0 && <span className="text-[13px] text-white/40">띄울 근거 슬라이드가 없어요</span>}
            {candidates.map((c, i) => {
              const on = current === c.page;
              return (
                <button
                  key={c.page}
                  type="button"
                  onClick={() => onSend(i)}
                  title={c.quote}
                  className={`flex h-[30px] items-center gap-[6px] rounded-full border px-[12px] text-[13px] font-bold transition-colors ${
                    on ? 'border-[#e5322d] bg-[#e5322d] text-white' : 'border-white/20 text-white/80 hover:border-[#f26b1d] hover:text-white'
                  }`}
                >
                  <kbd className={`font-display text-[15px] leading-none ${on ? 'text-white' : 'text-[#f26b1d]'}`}>{i + 1}</kbd>
                  p.{c.page} 띄우기
                </button>
              );
            })}
            <button
              type="button"
              onClick={onClear}
              disabled={!current}
              className="flex h-[30px] items-center gap-[6px] rounded-full border border-white/20 px-[12px] text-[13px] font-bold text-white/70 hover:border-white/50 disabled:opacity-30"
            >
              <kbd className="font-display text-[15px] leading-none text-white/60">0</kbd>
              내리기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
