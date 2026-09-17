import { useEffect, useState } from 'react';
import {
  approveCore,
  discardCore,
  fetchCoreSuggest,
  saveCoreAnswer,
  type AnswerWarning,
  type CoreItem,
} from '../api';

interface CorePracticeScreenProps {
  presentationId: string;
  onFinish: () => void;
}

// 발표장에서 제일 자주 나오는 질문. 이것부터 보여주고 나머지는 "더 보기".
const PRIMARY = ['significance', 'why', 'limit', 'merit'];

// 추천은 모델 호출이라 느리고 부를 때마다 결과가 조금씩 다르다. 개발 모드에서 화면이 두 번 그려져도
// 발표당 한 번만 부른다.
const suggestRequests = new Map<string, Promise<CoreItem[]>>();
function loadOnce(presentationId: string) {
  if (!suggestRequests.has(presentationId)) {
    const req = fetchCoreSuggest(presentationId);
    req.catch(() => suggestRequests.delete(presentationId)); // 실패하면 다음에 다시 시도
    suggestRequests.set(presentationId, req);
  }
  return suggestRequests.get(presentationId)!;
}

// 기본 질문 연습. 발표자가 답하면 슬라이드와 대조한 뒤 칸으로 정리해 저장하고, 저장된 답만 실전에 뜬다.
export function CorePracticeScreen({ presentationId, onFinish }: CorePracticeScreenProps) {
  const [items, setItems] = useState<CoreItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let alive = true;
    loadOnce(presentationId)
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '질문을 불러오지 못했습니다'));
    return () => {
      alive = false;
    };
  }, [presentationId]);

  const savedCount = items?.filter((i) => i.approved).length ?? 0;
  const primary = items?.filter((i) => PRIMARY.includes(i.id)) ?? [];
  const others = items?.filter((i) => !PRIMARY.includes(i.id)) ?? [];

  function update(next: CoreItem) {
    setItems((prev) => prev?.map((i) => (i.id === next.id ? next : i)) ?? null);
  }

  return (
    <div className="flex flex-1 items-start justify-center py-[38px] w-full">
      <div className="flex flex-col gap-[22px] w-[980px]">
        <div className="flex items-end justify-between w-full">
          <div className="flex flex-col gap-[7px]">
            <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.78px] leading-[34px]">기본 질문 연습</p>
            <p className="font-normal text-[15px] text-[#6b7280]">
              자주 나오는 질문에 답해보세요. 답이 발표자료와 맞으면 저장되고, 실전에서 같은 질문이 나오면 바로 뜹니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onFinish}
            className="bg-[#f26b1d] flex h-[46px] items-center px-[22px] rounded-[6px] shrink-0"
          >
            <span className="font-bold text-[15px] text-white whitespace-nowrap">실전으로 ({savedCount}개 저장)</span>
          </button>
        </div>

        {error && <p className="font-medium text-[15px] text-[#bf382e]">{error}</p>}
        {!items && !error && (
          <p className="font-medium text-[16px] text-[#6b7280]">질문과 AI 참고 답을 준비하고 있어요··· (10초 정도)</p>
        )}

        {primary.map((item) => (
          <QuestionCard key={item.id} item={item} presentationId={presentationId} onChange={update} />
        ))}

        {others.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="self-start border border-[#e5e7eb] h-[42px] px-[16px] rounded-[6px] font-bold text-[14px] text-[#6b7280]"
          >
            {showMore ? '다른 기본 질문 접기' : `다른 기본 질문 더 보기 (${others.length}개)`}
          </button>
        )}
        {showMore &&
          others.map((item) => (
            <QuestionCard key={item.id} item={item} presentationId={presentationId} onChange={update} />
          ))}
      </div>
    </div>
  );
}

function QuestionCard({
  item,
  presentationId,
  onChange,
}: {
  item: CoreItem;
  presentationId: string;
  onChange: (item: CoreItem) => void;
}) {
  const [answer, setAnswer] = useState(item.approved?.answer ?? '');
  const [busy, setBusy] = useState<'' | 'check' | 'save'>('');
  const [warnings, setWarnings] = useState<AnswerWarning[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = item.approved;

  async function submit(confirmed: boolean) {
    setBusy(confirmed ? 'save' : 'check');
    setError(null);
    try {
      const r = await saveCoreAnswer(presentationId, item.id, answer, confirmed);
      if (r.status === 'needs_review') {
        setWarnings(r.warnings);
      } else {
        setWarnings(null);
        onChange({ ...item, approved: r.card });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다');
    } finally {
      setBusy('');
    }
  }

  async function useSuggestion() {
    setBusy('save');
    try {
      const card = await approveCore(presentationId, item.id, item.suggested, false);
      onChange({ ...item, approved: card });
    } finally {
      setBusy('');
    }
  }

  async function discard() {
    await discardCore(presentationId, item.id);
    onChange({ ...item, approved: null });
  }

  return (
    <div
      className={`border flex flex-col gap-[14px] px-[24px] py-[20px] rounded-[6px] w-full ${
        saved ? 'border-[#409959] bg-[#f3faf5]' : 'border-[#e5e7eb]'
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex gap-[10px] items-center">
          <p className="font-bold text-[20px] text-[#1a1a1a]">{item.label}</p>
          {saved && (
            <span className="bg-[#409959] px-[9px] py-[3px] rounded-full font-bold text-[12px] text-white">
              저장됨 · {saved.source === 'answer' ? '내 답' : 'AI 참고 답'}
              {saved.source === 'answer' && saved.confirmed_despite_warning
                ? ' (경고 확인함)'
                : ''}
            </span>
          )}
        </div>
        {saved && (
          <button
            type="button"
            onClick={discard}
            className="border border-[#e5e7eb] h-[34px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280]"
          >
            버림
          </button>
        )}
      </div>

      {saved && (
        <div className="flex flex-wrap items-center gap-[8px]">
          {saved.steps.map((s, i) => (
            <span key={i} className="flex items-center gap-[8px]">
              <span className="bg-white border border-[#409959] px-[12px] py-[6px] rounded-[6px] font-bold text-[15px] text-[#1a1a1a]">
                {s.text}
              </span>
              {i < saved.steps.length - 1 && <span className="font-black text-[#409959]">→</span>}
            </span>
          ))}
          <span className="font-medium text-[12px] text-[#6b7280]">실전에 이 순서로 뜹니다</span>
        </div>
      )}

      <div className="flex flex-col gap-[8px] w-full">
        <textarea
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setWarnings(null);
          }}
          placeholder="실전에서 말하듯이 답해보세요"
          className="bg-white border border-[#e5e7eb] min-h-[84px] px-[16px] py-[12px] rounded-[6px] text-[16px] text-[#1a1a1a] outline-none w-full resize-none leading-[26px]"
        />
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => setShowHint((v) => !v)}
            disabled={item.status !== 'ok'}
            className="font-bold text-[13px] text-[#6b7280] disabled:opacity-40"
          >
            {item.status !== 'ok' ? '자료로 만든 AI 참고 답 없음' : showHint ? 'AI 참고 답 접기' : 'AI 참고 답 보기'}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={!answer.trim() || !!busy}
            className="bg-[#1a1a1a] h-[40px] px-[18px] rounded-[6px] font-bold text-[14px] text-white disabled:opacity-40"
          >
            {busy === 'check' ? '발표자료와 대조하는 중···' : saved ? '답 다시 저장' : '답 저장'}
          </button>
        </div>
      </div>

      {warnings && warnings.length > 0 && (
        <div className="bg-[#fae5e0] border border-[#bf382e] flex flex-col gap-[10px] px-[18px] py-[14px] rounded-[6px] w-full">
          <p className="font-bold text-[15px] text-[#1a1a1a]">발표자료와 맞지 않는 부분이 있어 저장하지 않았어요</p>
          <ul className="flex flex-col gap-[6px]">
            {warnings.map((w, i) => (
              <li key={i} className="font-medium text-[14px] text-[#1a1a1a]">
                {w.slide ? <span className="font-bold text-[#bf382e] mr-[6px]">p.{w.slide}</span> : null}
                {w.message}
              </li>
            ))}
          </ul>
          <div className="flex gap-[8px] items-center">
            <p className="flex-1 font-normal text-[13px] text-[#6b7280]">
              답을 고쳐서 다시 저장하거나, 자료가 틀렸고 내 말이 맞다면 그대로 저장하세요.
            </p>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={!!busy}
              className="border border-[#bf382e] bg-white h-[36px] px-[14px] rounded-[6px] font-bold text-[13px] text-[#bf382e] whitespace-nowrap"
            >
              {busy === 'save' ? '저장 중···' : '맞게 말했음, 저장'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="font-medium text-[14px] text-[#bf382e]">{error}</p>}

      {showHint && item.status === 'ok' && (
        <div className="bg-[#f9fafb] border border-dashed border-[#e5e7eb] flex flex-col gap-[10px] px-[16px] py-[12px] rounded-[6px] w-full">
          <p className="font-bold text-[12px] text-[#6b7280]">AI 참고 답 (발표자료를 종합한 것, 그대로 믿지 말고 확인하세요)</p>
          <div className="flex flex-wrap items-center gap-[8px]">
            {item.suggested.map((s, i) => (
              <span key={i} className="flex items-center gap-[8px]">
                <span className="bg-white border border-[#e5e7eb] px-[10px] py-[5px] rounded-[6px] font-medium text-[14px] text-[#1a1a1a]">
                  {s.text} <span className="text-[#9ca3af] text-[12px]">p.{s.slide}</span>
                </span>
                {i < item.suggested.length - 1 && <span className="text-[#9ca3af]">→</span>}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={useSuggestion}
            disabled={!!busy}
            className="self-start border border-[#e5e7eb] bg-white h-[34px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280]"
          >
            참고 답을 확인했고 그대로 저장
          </button>
        </div>
      )}
    </div>
  );
}
