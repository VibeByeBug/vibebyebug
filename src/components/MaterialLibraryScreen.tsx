import { useEffect, useState } from 'react';
import { deletePresentation, listPresentations, type SavedPresentation } from '../api';

// 발표 목록: 그동안 올린 발표 전체. 여기서 이어서 열거나 지우고, 새로 올릴 수 있다.
// "최근 촬영분"(시작 화면)은 최근 3개만 보여주는 요약이고, 여기는 전체 목록 + 관리 기능이다.
// 발표자료(PDF) 하나 = 발표 하나로 다룬다. 올린 자료가 곧 그 발표의 실체다.

interface MaterialLibraryScreenProps {
  onResume: (p: SavedPresentation) => void;
  onNew: () => void; // 발표 이름부터 새로 정하지 않고 바로 자료 올리기로 간다
  currentPresentationId?: string; // 지금 진행 중인 발표(있으면). 실수로 지우지 않게 막는다
}

export function MaterialLibraryScreen({ onResume, onNew, currentPresentationId }: MaterialLibraryScreenProps) {
  const [rows, setRows] = useState<SavedPresentation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // 하나씩 지울 때
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function load() {
    listPresentations()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다'));
  }

  useEffect(load, []);

  // 선택 가능한 것(지금 보는 중인 발표는 애초에 선택 대상에서 뺀다)
  const selectableIds = (rows ?? []).filter((r) => r.presentation_id !== currentPresentationId).map((r) => r.presentation_id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(p: SavedPresentation) {
    if (p.presentation_id === currentPresentationId) return; // 방어적으로 한 번 더 막는다 (버튼도 비활성)
    if (!window.confirm(`"${p.title}" 을(를) 지울까요? 올린 자료와 저장된 설명, 기록이 모두 사라지고 되돌릴 수 없습니다.`)) return;
    setBusyId(p.presentation_id);
    setError(null);
    try {
      await deletePresentation(p.presentation_id);
      setRows((cur) => cur?.filter((r) => r.presentation_id !== p.presentation_id) ?? cur);
      setSelected((s) => {
        if (!s.has(p.presentation_id)) return s;
        const next = new Set(s);
        next.delete(p.presentation_id);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '지우지 못했습니다');
    } finally {
      setBusyId(null);
    }
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`선택한 ${ids.length}개를 지울까요? 올린 자료와 저장된 설명, 기록이 모두 사라지고 되돌릴 수 없습니다.`)) return;
    setBulkBusy(true);
    setError(null);
    const failed: string[] = [];
    // 파일을 지우기만 하는 가벼운 작업이라 한 번에 보낸다 (검색 색인을 다시 만드는 작업이 아니다)
    await Promise.all(
      ids.map((id) =>
        deletePresentation(id)
          .then(() => {
            setRows((cur) => cur?.filter((r) => r.presentation_id !== id) ?? cur);
          })
          .catch(() => failed.push(id)),
      ),
    );
    setSelected(new Set(failed));
    if (failed.length) setError(`${failed.length}개는 지우지 못했습니다. 다시 시도해주세요.`);
    setBulkBusy(false);
  }

  return (
    <div className="flex flex-col gap-[24px] pb-[44px] pt-[34px] px-[16px] sm:px-[44px] w-full max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <p className="font-black text-[26px] text-ink tracking-[-0.6px]">발표 목록</p>
          <p className="font-normal text-[14px] text-ink/55">그동안 올린 발표를 한 곳에서 관리해요.</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="cta bg-[#f26b1d] hover:bg-[#e25c10] h-[44px] px-[20px] rounded-[8px] font-bold text-[15px] text-white shrink-0"
        >
          + 새 발표 올리기
        </button>
      </div>

      {error && <p className="font-medium text-[14px] text-err">{error}</p>}

      {rows === null && !error && <p className="font-medium text-[14px] text-ink/50">불러오는 중···</p>}

      {rows?.length === 0 && (
        <p className="rounded-[10px] border border-dashed border-ink/15 px-[16px] py-[24px] text-center font-medium text-[14px] text-ink/50">
          아직 올린 발표가 없어요. 위 버튼으로 첫 발표자료를 올려보세요.
        </p>
      )}

      {selectableIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-[14px]">
          <label className="flex items-center gap-[8px] font-medium text-[13px] text-ink/60 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
              className="accent-[#f26b1d]"
            />
            전체 선택
          </label>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selected.size === 0 || bulkBusy}
            className="h-[32px] px-[14px] rounded-[7px] border border-ink/20 font-bold text-[13px] text-ink/75 hover:border-err hover:text-err disabled:opacity-40"
          >
            {bulkBusy ? '지우는 중···' : selected.size > 0 ? `선택한 ${selected.size}개 지우기` : '선택 지우기'}
          </button>
        </div>
      )}

      <div className="flex flex-col w-full">
        {rows?.map((p) => {
          const isCurrent = p.presentation_id === currentPresentationId;
          const busy = busyId === p.presentation_id || (bulkBusy && selected.has(p.presentation_id));
          return (
            <div
              key={p.presentation_id}
              className={`border-t border-ink/10 flex flex-wrap items-center gap-[14px] px-[4px] py-[16px] w-full transition-colors ${
                selected.has(p.presentation_id) ? 'bg-ink/[0.03]' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(p.presentation_id)}
                onChange={() => toggle(p.presentation_id)}
                disabled={isCurrent}
                className="accent-[#f26b1d] disabled:opacity-30"
                aria-label="이 발표 선택"
              />
              <div className="flex flex-col gap-[4px] flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <p className="font-bold text-[17px] text-ink break-keep">{p.title}</p>
                  {isCurrent && (
                    <span className="rounded-full bg-sel px-[9px] py-[2px] font-bold text-[11px] text-selInk whitespace-nowrap">
                      지금 보는 중
                    </span>
                  )}
                  {p.ready ? (
                    <span className="font-bold text-[12px] text-ok whitespace-nowrap">준비됨</span>
                  ) : (
                    <span className="font-medium text-[12px] text-ink/40 whitespace-nowrap">다시 열면 준비해요</span>
                  )}
                </div>
                <p className="font-normal text-[13px] text-ink/45">
                  {new Date(p.uploaded_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  <span className="mx-[6px]">·</span>
                  {p.size_mb}MB
                </p>
              </div>
              <div className="flex gap-[8px] items-center shrink-0">
                <button
                  type="button"
                  onClick={() => onResume(p)}
                  className="h-[36px] px-[16px] rounded-[8px] border border-ink/20 font-bold text-[13px] text-ink/80 hover:border-ink/45"
                >
                  이어서 하기
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={isCurrent || busy}
                  title={isCurrent ? '지금 보는 중인 발표는 지울 수 없어요' : undefined}
                  className="h-[36px] px-[16px] rounded-[8px] border border-ink/20 font-bold text-[13px] text-ink/60 hover:border-err hover:text-err disabled:opacity-40 disabled:hover:border-ink/20 disabled:hover:text-ink/60"
                >
                  {busy ? '지우는 중···' : '삭제'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
