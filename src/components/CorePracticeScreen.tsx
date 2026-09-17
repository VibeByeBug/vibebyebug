import { useEffect, useState } from 'react';
import { approveCore, discardCore, fetchCoreSuggest, type CoreItem } from '../api';
import type { FlowStep } from '../types/qa';

interface CorePracticeScreenProps {
  presentationId: string;
  onFinish: () => void;
}

// 추천은 모델 호출이라 느리고 부를 때마다 결과가 조금씩 다르다. 개발 모드에서 화면이 두 번 그려지면
// 요청이 두 번 가서 입력칸과 추천 원본이 어긋났다("고쳐서 확정"으로 잘못 표시). 발표당 한 번만 부른다.
const suggestRequests = new Map<string, Promise<CoreItem[]>>();
function loadOnce(presentationId: string) {
  if (!suggestRequests.has(presentationId)) {
    const req = fetchCoreSuggest(presentationId);
    req.catch(() => suggestRequests.delete(presentationId)); // 실패하면 다음에 다시 시도
    suggestRequests.set(presentationId, req);
  }
  return suggestRequests.get(presentationId)!;
}

// 어느 발표에나 나오는 기본 질문. AI 가 자료를 종합해 추천하고, 발표자가 확정한 답만 실전에 뜬다.
export function CorePracticeScreen({ presentationId, onFinish }: CorePracticeScreenProps) {
  const [items, setItems] = useState<CoreItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadOnce(presentationId)
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '추천을 불러오지 못했습니다'));
    return () => {
      alive = false;
    };
  }, [presentationId]);

  const approvedCount = items?.filter((i) => i.approved).length ?? 0;

  return (
    <div className="flex flex-1 items-start justify-center py-[38px] w-full">
      <div className="flex flex-col gap-[22px] w-[980px]">
        <div className="flex items-end justify-between w-full">
          <div className="flex flex-col gap-[7px]">
            <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px]">기본 질문 답 확정하기</p>
            <p className="font-normal text-[15px] text-[#6b7280]">
              AI가 자료 전체를 읽고 말할 순서를 추천했어요. 고치거나 확정한 답만 실전에서 바로 뜹니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onFinish}
            className="bg-[#f26b1d] flex h-[46px] items-center px-[22px] rounded-[6px] shrink-0"
          >
            <span className="font-bold text-[15px] text-white whitespace-nowrap">
              실전으로 ({approvedCount}개 확정)
            </span>
          </button>
        </div>

        {error && <p className="font-medium text-[15px] text-[#bf382e]">{error}</p>}
        {!items && !error && (
          <p className="font-medium text-[16px] text-[#6b7280]">AI가 자료를 읽고 답을 추천하고 있어요··· (10초 정도)</p>
        )}

        {items?.map((item) => (
          <CoreItemCard
            key={item.id}
            item={item}
            presentationId={presentationId}
            onChange={(next) => setItems((prev) => prev?.map((i) => (i.id === next.id ? next : i)) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

function CoreItemCard({
  item,
  presentationId,
  onChange,
}: {
  item: CoreItem;
  presentationId: string;
  onChange: (item: CoreItem) => void;
}) {
  const initial = item.approved?.steps ?? item.suggested;
  const [steps, setSteps] = useState<FlowStep[]>(initial.length ? initial : [{ text: '', slide: null }]);
  const [busy, setBusy] = useState(false);

  // 추천에서 한 글자라도 바꿨으면 "발표자 수정"
  const edited =
    steps.length !== item.suggested.length || steps.some((s, i) => s.text !== item.suggested[i]?.text);

  function setText(i: number, text: string) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, text } : s)));
  }

  async function approve() {
    setBusy(true);
    try {
      const card = await approveCore(presentationId, item.id, steps.filter((s) => s.text.trim()), edited);
      onChange({ ...item, approved: card });
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await discardCore(presentationId, item.id);
      onChange({ ...item, approved: null });
    } finally {
      setBusy(false);
    }
  }

  const approved = !!item.approved;

  return (
    <div
      className={`border flex flex-col gap-[14px] px-[24px] py-[20px] rounded-[6px] w-full ${
        approved ? 'border-[#409959] bg-[#f3faf5]' : 'border-[#e5e7eb]'
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex gap-[10px] items-center">
          <p className="font-bold text-[20px] text-[#1a1a1a]">{item.label}</p>
          {approved && (
            <span className="bg-[#409959] px-[9px] py-[3px] rounded-full font-bold text-[12px] text-white">
              확정{item.approved?.edited ? ' · 발표자 수정' : ''}
            </span>
          )}
          {item.status !== 'ok' && !approved && (
            <span className="bg-[#f3f4f6] px-[9px] py-[3px] rounded-full font-medium text-[12px] text-[#6b7280]">
              {item.status === 'error' ? '추천 실패' : '자료로 추천할 수 없음, 직접 작성 가능'}
            </span>
          )}
        </div>
        <div className="flex gap-[8px]">
          {approved && (
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280]"
            >
              버림
            </button>
          )}
          <button
            type="button"
            onClick={approve}
            disabled={busy || !steps.some((s) => s.text.trim())}
            className="bg-[#1a1a1a] h-[38px] px-[16px] rounded-[6px] font-bold text-[14px] text-white disabled:opacity-40"
          >
            {approved ? '다시 확정' : edited && item.suggested.length ? '고쳐서 확정' : '확정'}
          </button>
        </div>
      </div>

      <div className="flex items-stretch gap-[10px] w-full">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-1 items-center gap-[10px] min-w-0">
            <div className="flex flex-1 flex-col gap-[6px] bg-white border border-[#e5e7eb] px-[14px] py-[12px] rounded-[6px] min-w-0">
              <span className="font-bold text-[12px] text-[#f26b1d]">{i + 1}</span>
              <input
                value={step.text}
                onChange={(e) => setText(i, e.target.value)}
                maxLength={30}
                placeholder="말할 내용"
                className="font-bold text-[17px] text-[#1a1a1a] outline-none w-full"
              />
              <span className="font-medium text-[12px] text-[#6b7280]">
                {step.slide ? `p.${step.slide}` : '발표자 작성'}
              </span>
            </div>
            {i < steps.length - 1 && <span className="font-black text-[18px] text-[#f26b1d] shrink-0">→</span>}
          </div>
        ))}
        {steps.length < 3 && (
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, { text: '', slide: null }])}
            className="border border-dashed border-[#e5e7eb] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280] shrink-0"
          >
            + 칸
          </button>
        )}
      </div>
    </div>
  );
}
