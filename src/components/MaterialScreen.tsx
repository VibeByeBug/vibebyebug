import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useFileDrop } from '../hooks/useFileDrop';
import { SlideText } from './SlideText';

// 발표자 설명 모으기: 리허설 녹음, 발표 대본, 설명 자료.
// AI 가 문장을 나눠 분류하고, 발표자가 확인한 것만 저장한다. 저장된 설명은 검색, 답변, 슬라이드 지도에 들어간다.

interface Slide {
  page: number;
  title: string;
  text: string;
  refined?: string | null; // AI 가 읽기 좋게 정리한 글 (보여주기용)
}
interface Note {
  id: string;
  page: number | null;
  kind: 'repeat' | 'explain' | 'fact';
  text: string;
  source: 'rehearsal' | 'script' | 'doc';
}
interface Item {
  page: number | null;
  kind: 'repeat' | 'explain' | 'fact' | 'filler';
  text: string;
  dup: boolean;
  new_numbers: string[];
  para?: number; // 원래 글의 문단 번호 (지식 조각을 문단 단위로 묶는다)
  section?: string; // 그 문단의 소제목
  checked?: boolean;
}

const SOURCE_LABEL = { rehearsal: '리허설', script: '발표 대본', doc: '설명 자료' } as const;
const KIND_LABEL = { repeat: '슬라이드 반복', explain: '보충 설명', fact: '새 사실', filler: '군말' } as const;

async function post(url: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? `요청 실패 (${res.status})`);
  return data;
}

// AI 정리 요청을 중간에 취소할 수 있게 한다.
// 취소한 뒤에 늦게 도착한 응답이 화면을 덮어쓰지 않도록, begin() 이 준 것이 지금 요청인지 isCurrent 로 본다.
// (취소하고 바로 다시 정리하면 앞 요청의 마무리가 뒤 요청의 busy 를 꺼버릴 수 있다.)
function useAbortable() {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []); // 화면을 떠나면 진행 중인 요청도 끊는다
  return {
    begin() {
      ref.current?.abort();
      const c = new AbortController();
      ref.current = c;
      return c;
    },
    isCurrent: (c: AbortController) => ref.current === c,
    cancel() {
      ref.current?.abort();
      ref.current = null;
    },
  };
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

// 처음 체크 상태: 보충 설명은 저장, 중복과 군말은 저장 안 함.
// 슬라이드 반복은 답변 근거로는 안 쓰고 검색용 표현으로만 저장하므로 기본 체크.
// 새 사실은 리허설에서는 말하다 숫자를 틀릴 수 있어서 발표자가 직접 체크한다.
// 대본과 설명 자료는 발표자가 써서 올린 글이라 기본 체크하고, 표시만 해둔다.
function initialCheck(it: Item, source: 'rehearsal' | 'script' | 'doc') {
  if (it.dup || it.kind === 'filler') return false;
  if (it.kind === 'fact') return source !== 'rehearsal';
  return true;
}

export function MaterialScreen({
  presentationId,
  onBack,
  initialPage,
}: {
  presentationId: string;
  onBack: () => void;
  initialPage?: number; // 슬라이드 지도에서 "이 슬라이드 설명 추가" 로 들어오면 그 슬라이드부터 연다
}) {
  const [tab, setTab] = useState<'rehearsal' | 'doc' | 'saved'>('rehearsal');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [refining, setRefining] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/notes/${presentationId}`);
    const data = await res.json();
    const got: Slide[] = data.slides ?? [];
    setSlides(got);
    setNotes(data.notes ?? []);
    // 정리본이 아직 없으면 만들어 달라고 한다 (20초 안팎). 그동안은 원문을 보여준다.
    if (got.length && !got.some((s) => s.refined)) {
      setRefining(true);
      try {
        const r = await fetch(`${API_URL}/api/notes/${presentationId}/refined`).then((x) => x.json());
        const map: Record<string, string> = r.refined ?? {};
        setSlides((cur) => cur.map((s) => ({ ...s, refined: map[String(s.page)] ?? s.refined })));
      } catch {
        // 정리에 실패해도 원문으로 충분히 쓸 수 있다
      } finally {
        setRefining(false);
      }
    }
  }, [presentationId]);

  useEffect(() => {
    load();
  }, [load]);

  function onSaved(next: Note[]) {
    setNotes(next);
  }

  const answerNotes = notes.filter((n) => n.kind !== 'repeat').length;

  return (
    <div className="flex flex-col gap-[16px] pb-[36px] pt-[24px] px-[16px] sm:px-[32px] w-full max-w-[1400px] mx-auto">
      <div className="flex flex-col items-center text-center gap-[6px]">
        <p className="font-black text-[30px] text-ink tracking-[-0.8px]">자료 보강</p>
        <p className="font-normal text-[14px] text-ink/55 leading-[21px] max-w-[720px] break-keep">
          슬라이드에 없는 설명을 모으면 "왜", "어떻게" 질문에 더 깊게 답할 수 있어요. 슬라이드에 이미 있는 말은 답변 근거로
          쓰지 않고, 청중 질문을 찾는 표현으로만 둡니다.
        </p>
      </div>

      {/* 탭은 가운데, 지도 다시 만들기와 돌아가기는 오른쪽 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-[12px]">
        <div className="hidden lg:block" />
        <div className="justify-self-center flex gap-[4px] rounded-[10px] border border-ink/10 bg-ink/[0.05] p-[4px]">
          {(
            [
              ['rehearsal', '리허설 녹음', null],
              ['doc', '대본, 설명 자료', null],
              ['saved', '저장된 설명', answerNotes],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-[7px] h-[36px] px-[16px] rounded-[7px] font-bold text-[14px] whitespace-nowrap transition-colors ${
                tab === key ? 'bg-sel text-selInk' : 'text-ink/60 hover:text-ink hover:bg-ink/[0.06]'
              }`}
            >
              {label}
              {n !== null && <span className={`font-mono text-[13px] ${tab === key ? 'text-[#f26b1d]' : 'text-ink/40'}`}>{n}</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-[8px] justify-center lg:justify-end">
          {/* 지도 다시 그리기는 지도 화면으로 옮겼다. 저장한 설명은 검색과 답변에 바로 반영된다. */}
          <button
            type="button"
            onClick={onBack}
            className="h-[38px] px-[16px] rounded-[8px] border border-ink/20 font-bold text-[14px] text-ink/75 hover:border-ink/45"
          >
            돌아가기
          </button>
        </div>
      </div>

      {tab === 'rehearsal' && (
        <Rehearsal
          presentationId={presentationId}
          slides={slides}
          notes={notes}
          onSaved={onSaved}
          initialPage={initialPage}
          refining={refining}
        />
      )}
      {tab === 'doc' && <DocInput presentationId={presentationId} onSaved={onSaved} />}
      {tab === 'saved' && <Saved presentationId={presentationId} slides={slides} notes={notes} onChange={onSaved} />}
    </div>
  );
}

// 리허설 화면: 왼쪽 필름 스트립(슬라이드 고르기), 가운데 슬라이드 카드, 오른쪽 녹음 패널과 정리 결과.
// 세 칸이 화면 높이에 맞춰 따로 스크롤되어, 설명을 길게 말해도 슬라이드가 밀려 올라가지 않는다.
const PANE_H = 'lg:h-[calc(100vh-300px)] lg:min-h-[520px]';

function Rehearsal({
  presentationId,
  slides,
  notes,
  onSaved,
  initialPage,
  refining,
}: {
  presentationId: string;
  slides: Slide[];
  notes: Note[];
  onSaved: (n: Note[]) => void;
  initialPage?: number;
  refining?: boolean;
}) {
  const [index, setIndex] = useState(0);
  // 슬라이드 목록이 도착하면 처음 열 슬라이드로 옮긴다 (한 번만)
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || initialPage == null || !slides.length) return;
    jumped.current = true;
    const at = slides.findIndex((s) => s.page === initialPage);
    if (at >= 0) setIndex(at);
  }, [slides, initialPage]);
  const [transcript, setTranscript] = useState('');
  const [partial, setPartial] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]); // 방금 저장한 묶음 (되돌리기용)
  const [showRaw, setShowRaw] = useState(false);
  const [take, setTake] = useState(1); // 이 슬라이드에서 몇 번째 녹음인가. 저장할 때마다 하나 올라간다
  const [secs, setSecs] = useState(0);
  const ab = useAbortable();
  const slide = slides[index];

  // 음성 인식 결과는 이어 붙인다. 발표자가 텍스트 칸에서 직접 고칠 수도 있다.
  const appendRef = useRef((t: string) => setTranscript((prev) => (prev ? `${prev} ${t}` : t)));
  const { start, stop, listening } = useSpeechRecognition({
    onPartialResult: setPartial,
    onFinalResult: (t) => {
      setPartial('');
      appendRef.current(t);
    },
    onError: () => setError('음성 인식을 시작하지 못했어요. 크롬에서 마이크 권한을 허용해주세요. 글로 적어도 됩니다.'),
  });

  // 녹음 시간. 멈췄다 다시 누르면 이어서 센다
  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  // 슬라이드마다 저장된 설명 수 (필름 스트립 배지). 슬라이드 반복은 답변 근거가 아니라 세지 않는다
  const counts = new Map<number, number>();
  for (const n of notes) if (n.page != null && n.kind !== 'repeat') counts.set(n.page, (counts.get(n.page) ?? 0) + 1);

  function go(next: number) {
    const to = Math.max(0, Math.min(slides.length - 1, next));
    if (to === index) return;
    stop();
    ab.cancel(); // 정리 중에 다른 슬라이드로 넘어가면, 늦게 온 결과가 그 슬라이드에 뜨지 않게 끊는다
    setBusy(false);
    setIndex(to);
    setTranscript('');
    setPartial('');
    setItems(null);
    setSavedMsg(null);
    setAddedIds([]);
    setError(null);
    setTake(1);
    setSecs(0);
  }

  async function organize() {
    stop();
    const c = ab.begin();
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    setAddedIds([]);
    try {
      const r = await post(
        `${API_URL}/api/notes/${presentationId}/classify`,
        { text: transcript, source: 'rehearsal', page: slide?.page },
        c.signal,
      );
      if (!ab.isCurrent(c)) return;
      setItems((r.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, 'rehearsal') })));
    } catch (e) {
      if (isAbort(e) || !ab.isCurrent(c)) return;
      setError(e instanceof Error ? e.message : '정리하지 못했습니다');
    } finally {
      if (ab.isCurrent(c)) setBusy(false);
    }
  }

  // 정리 중에 취소. 서버는 정리만 하고 아무것도 저장하지 않으므로 결과를 버리면 끝이다.
  function cancelOrganize() {
    ab.cancel();
    setBusy(false);
  }

  if (!slide) return <p className="font-medium text-[14px] text-ink/55 text-center py-[40px]">슬라이드를 불러오는 중···</p>;

  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[172px_minmax(0,1fr)_minmax(0,1.08fr)] gap-[20px] items-start">
      <FilmStrip presentationId={presentationId} slides={slides} index={index} counts={counts} onPick={go} />

      {/* 슬라이드 카드: 슬라이드 그림, 그 아래 AI 정리본(또는 PDF 원문) */}
      <section className={`flex flex-col min-w-0 rounded-[12px] border border-ink/10 bg-card overflow-hidden ${PANE_H}`}>
        <div className="flex items-start justify-between gap-[12px] px-[22px] pt-[16px] pb-[12px]">
          <div className="flex items-baseline gap-[12px] min-w-0">
            <span className="font-display text-[44px] leading-[40px] text-[#f26b1d] shrink-0">P.{slide.page}</span>
            <span className="font-bold text-[16px] text-ink/85 leading-[22px] line-clamp-2 break-keep">{slide.title}</span>
          </div>
          {slide.refined ? (
            <div className="flex shrink-0 gap-[2px] rounded-full bg-ink/[0.07] p-[3px]">
              {(
                [
                  [false, 'AI 정리본'],
                  [true, 'PDF 원문'],
                ] as const
              ).map(([raw, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setShowRaw(raw)}
                  className={`h-[26px] px-[12px] rounded-full font-bold text-[12px] whitespace-nowrap transition-colors ${
                    showRaw === raw ? 'bg-sel text-selInk' : 'text-ink/55 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            refining && <span className="shrink-0 font-medium text-[12px] text-ink/45 pt-[6px]">읽기 좋게 정리하는 중···</span>
          )}
        </div>
        <div className="flex-1 overflow-auto px-[22px] pb-[18px] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
          <SlideImage key={slide.page} presentationId={presentationId} page={slide.page} />
          <SlideText raw={slide.text} refined={slide.refined} pending={refining} dark showRaw={showRaw} />
          {slide.refined && !showRaw && (
            <p className="mt-[14px] font-medium text-[12px] text-ink/40 break-keep">
              AI 가 PDF 글자를 읽기 좋게 다시 정리했어요. 검색과 답변에는 원문을 씁니다.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-ink/10 px-[14px] py-[10px]">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="h-[32px] px-[12px] rounded-[7px] font-bold text-[13px] text-ink/70 hover:bg-ink/[0.07] hover:text-ink disabled:opacity-30"
          >
            ← 이전
          </button>
          <span className="font-mono text-[13px] text-ink/45">
            <span className="text-ink/85">{index + 1}</span> / {slides.length}
          </span>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === slides.length - 1}
            className="h-[32px] px-[12px] rounded-[7px] font-bold text-[13px] text-ink/70 hover:bg-ink/[0.07] hover:text-ink disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      </section>

      {/* 녹음 패널과 정리 결과 */}
      <div className={`flex flex-col gap-[14px] min-w-0 lg:overflow-auto lg:pr-[4px] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] ${PANE_H}`}>
        <section
          className={`flex flex-col gap-[14px] rounded-[12px] border bg-well px-[22px] py-[18px] transition-colors ${
            listening ? 'border-[#e5322d]/60' : 'border-ink/10'
          }`}
        >
          <div className="flex items-start justify-between gap-[16px]">
            <div className="flex flex-col gap-[8px] min-w-0">
              <div className="flex items-center gap-[10px]">
                <span className="font-display text-[40px] leading-[38px] tracking-[1px] text-ink">TAKE {take}</span>
                {listening && (
                  <span className="flex items-center gap-[6px] rounded-full bg-[#e5322d] px-[9px] h-[22px] font-bold text-[12px] text-white">
                    <span className="size-[6px] rounded-full bg-white tally-pulse" />
                    녹음 중
                  </span>
                )}
              </div>
              <p className="font-normal text-[13px] text-ink/55 leading-[20px] max-w-[380px] break-keep">
                이 슬라이드를 실제로 발표하듯 설명해보세요. 슬라이드에 없는 이유, 예시, 배경이 모일수록 답이 깊어져요.
              </p>
            </div>
            <div className="flex flex-col items-center gap-[6px] shrink-0">
              <button
                type="button"
                onClick={() => (listening ? stop() : start())}
                aria-label={listening ? '녹음 멈추기' : '녹음 시작'}
                title={listening ? '녹음 멈추기' : '녹음 시작'}
                className="relative grid place-items-center size-[84px] rounded-full hover:scale-[1.04] transition-[scale]"
              >
                <span
                  className={`absolute inset-0 rounded-full border-[5px] ${
                    listening ? 'border-[#e5322d]/70 tally-pulse' : 'border-[#e5322d]/30'
                  }`}
                />
                <span
                  className={`bg-[#e5322d] transition-all duration-200 ${
                    listening ? 'size-[30px] rounded-[7px]' : 'size-[56px] rounded-full'
                  }`}
                />
              </button>
              <span className={`font-mono font-bold text-[14px] ${listening ? 'text-ink' : 'text-ink/40'}`}>{clock}</span>
            </div>
          </div>
          <div className="h-px bg-ink/10" />
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="녹음 버튼을 누르고 말하면 여기에 쌓여요. 직접 적거나 고쳐도 됩니다."
            className="min-h-[150px] w-full resize-y bg-transparent font-medium text-[16px] leading-[26px] text-ink caret-[#f26b1d] outline-none placeholder:text-ink/30"
          />
          {partial && <p className="font-medium text-[15px] leading-[24px] text-ink/40">{partial}</p>}
        </section>

        <div className="flex items-center justify-between gap-[12px]">
          <span className="font-medium text-[12px] text-ink/40">
            {transcript.trim() ? `${transcript.trim().length}자` : ''}
          </span>
          <div className="flex gap-[8px] items-center">
            {busy && (
              <button
                type="button"
                onClick={cancelOrganize}
                className="h-[42px] px-[16px] rounded-[8px] border border-ink/25 font-bold text-[14px] text-ink/80 hover:border-ink/50 hover:text-ink"
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={organize}
              disabled={!transcript.trim() || busy}
              className="cta h-[42px] px-[20px] rounded-[8px] bg-[#f26b1d] font-bold text-[15px] text-white disabled:opacity-40"
            >
              {busy ? 'AI가 정리하는 중···' : '정리하기 →'}
            </button>
          </div>
        </div>
        {error && <p className="font-medium text-[13px] text-err">{error}</p>}
        {savedMsg && (
          <SavedNotice
            message={savedMsg}
            ids={addedIds}
            presentationId={presentationId}
            onUndone={(notes, removed) => {
              onSaved(notes);
              setAddedIds([]);
              setSavedMsg(`${removed}개를 지웠어요.`);
            }}
          />
        )}
        {items && (
          <Review
            items={items}
            setItems={setItems}
            presentationId={presentationId}
            source="rehearsal"
            discardLabel="정리 취소"
            onDiscard={() => setItems(null)}
            onSaved={(n, added, ids) => {
              onSaved(n);
              setItems(null);
              setTranscript('');
              setTake((t) => t + 1);
              setSecs(0);
              setAddedIds(ids);
              setSavedMsg(`${added}개 저장했어요. 더 말하거나 다음 슬라이드로 넘어가도 됩니다.`);
            }}
          />
        )}
      </div>
    </div>
  );
}

// 슬라이드 그림. PDF 가 없거나 그림을 못 만들면 조용히 숨긴다 (글만으로도 리허설은 된다)
function SlideImage({ presentationId, page }: { presentationId: string; page: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`${API_URL}/api/slides/${presentationId}/${page}.png`}
      alt={`${page}번 슬라이드`}
      onError={() => setFailed(true)}
      className="mb-[16px] w-full rounded-[6px] border border-ink/10 bg-[#f5f5f4]"
    />
  );
}

// 세로 필름 스트립. 좁은 화면에서는 가로로 눕는다
function FilmStrip({
  presentationId,
  slides,
  index,
  counts,
  onPick,
}: {
  presentationId: string;
  slides: Slide[];
  index: number;
  counts: Map<number, number>;
  onPick: (i: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [index]);
  return (
    <nav aria-label="슬라이드" className={`overflow-auto [scrollbar-width:none] rounded-[10px] border border-ink/10 bg-well ${PANE_H}`}>
      <div className="film-reel flex lg:flex-col gap-[14px] w-max lg:w-auto px-[14px] py-[22px] lg:px-[22px] lg:py-[14px]">
        {slides.map((s, i) => {
          const on = i === index;
          const n = counts.get(s.page) ?? 0;
          return (
            <button
              key={s.page}
              ref={on ? activeRef : undefined}
              type="button"
              onClick={() => onPick(i)}
              title={s.title}
              className={`group flex w-[128px] shrink-0 flex-col gap-[6px] rounded-[6px] p-[5px] text-left transition-colors ${
                on ? 'bg-sel' : 'hover:bg-ink/[0.07]'
              }`}
            >
              <div
                className={`relative aspect-video w-full overflow-hidden rounded-[3px] bg-[#2a241e] ${
                  on ? 'ring-2 ring-[#f26b1d]' : 'opacity-70 group-hover:opacity-100'
                } transition-opacity`}
              >
                <img
                  src={`${API_URL}/api/slides/${presentationId}/${s.page}.png`}
                  alt=""
                  loading="lazy"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-[4px] px-[2px]">
                <span className={`font-mono font-bold text-[11px] ${on ? 'text-[#f26b1d]' : 'text-ink/55'}`}>p.{s.page}</span>
                {n > 0 && (
                  <span className="rounded-full bg-[#2f7a47] px-[7px] font-bold text-[10px] leading-[16px] text-white">설명 {n}</span>
                )}
              </div>
              <span
                className={`px-[2px] font-bold text-[12px] leading-[16px] line-clamp-2 break-keep ${
                  on ? 'text-selInk' : 'text-ink/75'
                }`}
              >
                {s.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DocInput({ presentationId, onSaved }: { presentationId: string; onSaved: (n: Note[]) => void }) {
  const [source, setSource] = useState<'script' | 'doc'>('script');
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]); // 방금 저장한 묶음 (되돌리기용)
  const [fileName, setFileName] = useState<string | null>(null); // 정리 중인 파일
  const fileRef = useRef<HTMLInputElement>(null);
  const ab = useAbortable();

  // 입력칸에 파일을 끌어다 놓으면 "파일로 올리기" 와 똑같이 정리한다. 정리하는 중에는 받지 않는다.
  const { dragging, bind } = useFileDrop({
    accept: ['.txt', '.md', '.pdf'],
    onFile: organizeFile,
    onReject: (f) => setError(`${f.name} 은(는) 올릴 수 없어요. txt, md, pdf 파일만 됩니다.`),
    disabled: busy,
  });

  async function organizeText() {
    const c = ab.begin();
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    setAddedIds([]);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/classify`, { text, source }, c.signal);
      if (!ab.isCurrent(c)) return;
      setItems((r.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, source) })));
    } catch (e) {
      if (isAbort(e) || !ab.isCurrent(c)) return;
      setError(e instanceof Error ? e.message : '정리하지 못했습니다');
    } finally {
      if (ab.isCurrent(c)) setBusy(false);
    }
  }

  async function organizeFile(file: File) {
    const c = ab.begin();
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    setAddedIds([]);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('source', source);
      const res = await fetch(`${API_URL}/api/notes/${presentationId}/classify-file`, { method: 'POST', body, signal: c.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? '파일을 정리하지 못했습니다');
      if (!ab.isCurrent(c)) return;
      setItems((data.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, source) })));
    } catch (e) {
      if (isAbort(e) || !ab.isCurrent(c)) return;
      setError(e instanceof Error ? e.message : '파일을 정리하지 못했습니다');
    } finally {
      if (ab.isCurrent(c)) {
        setBusy(false);
        setFileName(null);
      }
    }
  }

  // 정리 중에 취소. 서버는 정리만 하고 아무것도 저장하지 않으므로 결과를 버리면 끝이다.
  function cancelOrganize() {
    ab.cancel();
    setBusy(false);
    setFileName(null);
  }

  return (
    <div className="flex flex-col gap-[14px] w-full max-w-[900px] mx-auto">
      <div className="flex flex-wrap gap-[8px] items-center justify-center">
        {(['script', 'doc'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`h-[36px] px-[16px] rounded-[8px] font-bold text-[13px] transition-colors ${
              source === s ? 'bg-sel text-selInk' : 'border border-ink/20 text-ink/65 hover:text-ink'
            }`}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
        <span className="font-normal text-[13px] text-ink/50 break-keep">
          {source === 'script' ? '발표할 때 읽는 대본' : '기획서, 보고서, README 같은 프로젝트 설명'}
        </span>
      </div>
      <div {...bind} className="relative flex flex-col">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="내용을 붙여넣거나, 파일(txt, md, pdf)을 여기로 끌어다 놓으세요. 슬라이드에 이미 있는 말은 자동으로 걸러집니다."
          className="border border-ink/12 bg-card min-h-[220px] px-[18px] py-[16px] rounded-[10px] text-[15px] text-ink/90 leading-[25px] outline-none resize-y placeholder:text-ink/30"
        />
        {/* 끄는 동안만 덮는다. pointer-events-none 이라 끌기 이벤트는 아래 칸이 그대로 받는다 */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[10px] border-2 border-dashed border-[#f26b1d] bg-[#f26b1d]/10">
            <p className="font-bold text-[16px] text-[#f26b1d]">여기에 놓으면 파일로 정리해요</p>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-[8px] items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) organizeFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-[38px] px-[16px] rounded-[8px] border border-ink/20 font-bold text-[13px] text-ink/70 hover:border-ink/45 disabled:opacity-40"
          >
            파일로 올리기 (txt, md, pdf)
          </button>
          <span className="font-normal text-[12px] text-ink/45 break-keep">또는 입력칸으로 끌어다 놓기</span>
          {busy && fileName && (
            <span className="max-w-[220px] truncate font-medium text-[13px] text-ink/55" title={fileName}>
              {fileName}
            </span>
          )}
        </div>
        <div className="flex gap-[8px] items-center">
          {busy && (
            <button
              type="button"
              onClick={cancelOrganize}
              className="h-[42px] px-[16px] rounded-[8px] border border-ink/25 font-bold text-[14px] text-ink/80 hover:border-ink/50 hover:text-ink"
            >
              취소
            </button>
          )}
          <button
            type="button"
            onClick={organizeText}
            disabled={!text.trim() || busy}
            className="cta bg-[#f26b1d] h-[42px] px-[20px] rounded-[8px] font-bold text-[15px] text-white disabled:opacity-40"
          >
            {busy ? 'AI가 정리하는 중···' : '정리하기 →'}
          </button>
        </div>
      </div>
      {error && <p className="font-medium text-[13px] text-err">{error}</p>}
      {savedMsg && (
        <SavedNotice
          message={savedMsg}
          ids={addedIds}
          presentationId={presentationId}
          onUndone={(notes, removed) => {
            onSaved(notes);
            setAddedIds([]);
            setSavedMsg(`${removed}개를 지웠어요.`);
          }}
        />
      )}
      {items && (
        <Review
          items={items}
          setItems={setItems}
          presentationId={presentationId}
          source={source}
          discardLabel="업로드 취소"
          onDiscard={() => setItems(null)}
          onSaved={(n, added, ids) => {
            onSaved(n);
            setItems(null);
            setText('');
            setAddedIds(ids);
            setSavedMsg(`${added}개 저장했어요.`);
          }}
        />
      )}
    </div>
  );
}

// 정리 결과 확인. 새로 저장될 설명은 펼쳐 두고, 슬라이드 반복과 중복은 접어 둔다.
function Review({
  items,
  setItems,
  presentationId,
  source,
  onSaved,
  onDiscard,
  discardLabel = '취소',
}: {
  items: Item[];
  setItems: (v: Item[]) => void;
  presentationId: string;
  source: 'rehearsal' | 'script' | 'doc';
  onSaved: (notes: Note[], added: number, addedIds: string[]) => void;
  onDiscard: () => void; // 저장하지 않고 정리 결과를 버린다
  discardLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const toggle = (i: number) => setItems(items.map((it, j) => (j === i ? { ...it, checked: !it.checked } : it)));

  const isMain = (it: Item) => (it.kind === 'explain' || it.kind === 'fact') && !it.dup;
  const main = items.map((it, i) => ({ it, i })).filter(({ it }) => isMain(it));
  const hidden = items.map((it, i) => ({ it, i })).filter(({ it }) => !isMain(it));
  const count = items.filter((it) => it.checked).length;

  async function save() {
    setBusy(true);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/save`, {
        source,
        items: items
          .filter((it) => it.checked && it.kind !== 'filler')
          .map(({ page, kind, text, para, section }) => ({ page, kind, text, para, section })),
      });
      onSaved(r.notes, r.added, r.added_ids ?? []);
    } finally {
      setBusy(false);
    }
  }

  const row = ({ it, i }: { it: Item; i: number }) => {
    const fact = it.kind === 'fact' && !it.dup;
    const quiet = !isMain(it);
    return (
      <label
        key={i}
        className={`rise-in flex cursor-pointer gap-[12px] items-start rounded-[10px] border bg-card px-[14px] py-[12px] transition-colors hover:bg-cardHover ${
          fact ? 'border-[#f26b1d]/60' : quiet ? 'border-ink/10' : 'border-[#58d68d]/35'
        }`}
      >
        <input type="checkbox" checked={!!it.checked} onChange={() => toggle(i)} className="sr-only" />
        <span
          aria-hidden
          className={`mt-[1px] grid size-[20px] shrink-0 place-items-center rounded-[5px] text-[13px] font-black transition-colors ${
            it.checked ? 'bg-[#f26b1d] text-white' : 'border border-ink/25 text-transparent'
          }`}
        >
          ✓
        </span>
        <div className="flex flex-col gap-[4px] min-w-0">
          <div className="flex flex-wrap gap-x-[8px] gap-y-[2px] items-center">
            <span className={`font-bold text-[12px] ${fact ? 'text-warn' : quiet ? 'text-ink/45' : 'text-ok'}`}>
              {it.dup ? '이미 저장됨' : KIND_LABEL[it.kind]}
            </span>
            <span className="font-mono font-bold text-[11px] text-ink/40">{it.page ? `p.${it.page}` : '전체'}</span>
            {fact && (
              <span className="font-medium text-[12px] text-warn/85 break-keep">
                슬라이드에 없는 내용이에요{it.new_numbers.length ? ` (${it.new_numbers.join(', ')})` : ''}. 맞는지 확인해주세요
              </span>
            )}
          </div>
          <span className={`font-medium text-[15px] leading-[23px] break-keep ${quiet ? 'text-ink/50' : 'text-ink/90'}`}>
            {it.text}
          </span>
        </div>
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-[10px] pt-[4px]">
      <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px]">
        <p className="font-black text-[18px] text-ink">
          새로 저장될 설명 <span className="font-mono text-[#f26b1d]">{main.length}</span>
        </p>
        <p className="font-medium text-[13px] text-ink/45">슬라이드에 이미 있는 말과 저장된 설명은 걸렀어요</p>
      </div>
      {main.length === 0 && (
        <p className="rounded-[10px] border border-dashed border-ink/15 px-[14px] py-[14px] text-center font-medium text-[14px] text-ink/50">
          슬라이드에 없는 새 설명이 없었어요. 이유나 예시를 더 말해보세요.
        </p>
      )}
      {main.map(row)}
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="self-start font-bold text-[13px] text-ink/50 hover:text-ink/80"
        >
          {showHidden ? '▾' : '▸'} 걸러진 문장 {hidden.length} (슬라이드 반복, 중복, 군말)
        </button>
      )}
      {showHidden && hidden.map(row)}
      <div className="flex flex-wrap justify-between items-center gap-[10px] pt-[4px]">
        <span className="font-normal text-[12px] text-ink/40 break-keep">
          슬라이드 반복은 답변 근거가 아니라 질문을 찾는 표현으로만 저장돼요.
        </span>
        <div className="flex gap-[8px] items-center">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="h-[42px] px-[16px] rounded-[8px] border border-ink/25 font-bold text-[14px] text-ink/80 hover:border-ink/50 hover:text-ink disabled:opacity-40"
          >
            {discardLabel}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || count === 0}
            className="cta h-[42px] px-[20px] rounded-[8px] bg-sel font-bold text-[15px] text-selInk disabled:opacity-40"
          >
            {busy ? '저장 중···' : `체크한 ${count}개 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}

// 저장 직후 안내. 방금 저장한 묶음을 한 번에 지울 수 있다 (하나씩 지우려면 저장된 설명 탭에서).
// 저장할 때 비슷한 기존 설명을 더 자세한 글로 바꾼 것은 되돌리지 않는다. 새로 생긴 설명만 지운다.
function SavedNotice({
  message,
  ids,
  presentationId,
  onUndone,
}: {
  message: string;
  ids: string[];
  presentationId: string;
  onUndone: (notes: Note[], removed: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/delete-many`, { ids });
      onUndone(r.notes, r.removed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '지우지 못했습니다');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px]">
      <p className="font-medium text-[13px] text-ok">{message}</p>
      {ids.length > 0 && (
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="font-bold text-[12px] text-ink/55 underline underline-offset-2 hover:text-err disabled:opacity-40"
        >
          {busy ? '지우는 중···' : `방금 저장한 ${ids.length}개 지우기`}
        </button>
      )}
      {error && <span className="font-medium text-[13px] text-err">{error}</span>}
    </div>
  );
}

function Saved({
  presentationId,
  slides,
  notes,
  onChange,
}: {
  presentationId: string;
  slides: Slide[];
  notes: Note[];
  onChange: (n: Note[]) => void;
}) {
  const [showRepeat, setShowRepeat] = useState(false);
  const shown = notes.filter((n) => showRepeat || n.kind !== 'repeat');
  const groups = new Map<number, Note[]>();
  for (const n of shown) {
    const k = n.page ?? 0;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const title = (p: number) => (p ? `p.${p} ${slides.find((s) => s.page === p)?.title ?? ''}` : '프로젝트 전반');

  async function remove(id: string) {
    const res = await fetch(`${API_URL}/api/notes/${presentationId}/${id}`, { method: 'DELETE' });
    onChange((await res.json()).notes);
  }

  return (
    <div className="flex flex-col gap-[16px] w-full max-w-[900px] mx-auto">
      <label className="flex gap-[8px] items-center justify-center font-medium text-[13px] text-ink/55 cursor-pointer">
        <input type="checkbox" checked={showRepeat} onChange={() => setShowRepeat((v) => !v)} className="accent-[#f26b1d]" />
        검색용 표현(슬라이드 반복)도 보기
      </label>
      {groups.size === 0 && (
        <p className="rounded-[10px] border border-dashed border-ink/15 px-[14px] py-[18px] text-center font-medium text-[14px] text-ink/50">
          아직 저장된 설명이 없어요. 리허설 녹음이나 대본으로 모아보세요.
        </p>
      )}
      {[...groups.entries()]
        .sort((a, b) => (a[0] || 999) - (b[0] || 999))
        .map(([p, list]) => (
          <div key={p} className="flex flex-col gap-[8px]">
            <p className="font-bold text-[15px] text-ink break-keep">
              {p ? <span className="font-mono text-[#f26b1d] mr-[6px]">p.{p}</span> : null}
              {p ? (slides.find((s) => s.page === p)?.title ?? '') : title(p)}
            </p>
            {list.map((n) => (
              <div
                key={n.id}
                className="group flex gap-[12px] items-start rounded-[10px] border border-ink/10 bg-card px-[16px] py-[12px] transition-colors hover:bg-cardHover"
              >
                <span
                  className={`font-bold text-[12px] shrink-0 mt-[2px] w-[74px] ${
                    n.kind === 'fact' ? 'text-warn' : n.kind === 'repeat' ? 'text-ink/40' : 'text-ok'
                  }`}
                >
                  {KIND_LABEL[n.kind]}
                </span>
                <span className="flex-1 font-medium text-[15px] text-ink/90 leading-[23px] break-keep">{n.text}</span>
                <span className="font-medium text-[12px] text-ink/40 shrink-0 mt-[2px]">{SOURCE_LABEL[n.source]}</span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="font-bold text-[12px] text-ink/35 hover:text-err shrink-0 mt-[2px]"
                >
                  지우기
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
