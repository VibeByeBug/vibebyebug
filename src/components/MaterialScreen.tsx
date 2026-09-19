import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { SlideText } from './SlideText';

// 발표자 설명 모으기: 리허설 녹음, 발표 대본, 설명 자료.
// AI 가 문장을 나눠 분류하고, 발표자가 확인한 것만 저장한다. 저장된 설명은 검색, 답변, 논리 지도에 들어간다.

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

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? `요청 실패 (${res.status})`);
  return data;
}

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
  initialPage?: number; // 논리 지도에서 "이 슬라이드 설명 추가" 로 들어오면 그 슬라이드부터 연다
}) {
  const [tab, setTab] = useState<'rehearsal' | 'doc' | 'saved'>('rehearsal');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [graphMsg, setGraphMsg] = useState<string | null>(null);
  const [graphBusy, setGraphBusy] = useState(false);
  const [dirty, setDirty] = useState(false); // 지도를 만든 뒤 설명이 바뀌었나

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

  async function rebuildGraph() {
    setGraphBusy(true);
    setGraphMsg(null);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/rebuild-graph`, {});
      setGraphMsg(`지식 지도를 다시 만들었어요. 슬라이드 연결 ${r.edges}개, 발표자 설명 ${r.notes_used}개 반영`);
      setDirty(false);
    } catch (e) {
      setGraphMsg(e instanceof Error ? e.message : '지식 지도를 만들지 못했습니다');
    } finally {
      setGraphBusy(false);
    }
  }

  function onSaved(next: Note[]) {
    setNotes(next);
    setDirty(true);
  }

  const answerNotes = notes.filter((n) => n.kind !== 'repeat').length;

  return (
    <div className="flex flex-col gap-[18px] pb-[40px] pt-[28px] px-[44px] w-full max-w-[1100px] mx-auto">
      <div className="flex flex-col items-center text-center gap-[14px]">
        <div className="flex flex-col gap-[6px] items-center">
          <p className="font-black text-[30px] text-[#111111] tracking-[-0.8px]">자료 보강</p>
          <p className="font-normal text-[14px] text-[#6b7280] leading-[21px] max-w-[720px]">
            슬라이드에 없는 설명을 모으면 "왜", "어떻게" 질문에 더 깊게 답할 수 있어요. 슬라이드에 이미 있는 말은 답변 근거로
            쓰지 않고, 청중 질문을 찾는 표현으로만 둡니다.
          </p>
        </div>
        <div className="flex gap-[8px] shrink-0">
          <button
            type="button"
            onClick={rebuildGraph}
            disabled={graphBusy}
            className={`h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] whitespace-nowrap disabled:opacity-50 ${
              dirty ? 'bg-[#f26b1d] text-white' : 'border border-[#e5e7eb] text-[#6b7280]'
            }`}
          >
            {graphBusy ? '지도 만드는 중... (30초 안팎)' : '지식 지도 다시 만들기'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280]"
          >
            돌아가기
          </button>
        </div>
      </div>
      {graphMsg && <p className="font-medium text-[13px] text-[#409959] text-center">{graphMsg}</p>}
      {dirty && !graphMsg && (
        <p className="font-medium text-[13px] text-[#f26b1d] text-center">
          설명이 바뀌었어요. 검색과 답변에는 바로 반영됐고, 지식 지도에도 넣으려면 "지식 지도 다시 만들기"를 눌러주세요.
        </p>
      )}

      <div className="flex justify-center gap-[6px] border-b border-[#e5e7eb]">
        {(
          [
            ['rehearsal', '리허설 녹음'],
            ['doc', '대본, 설명 자료'],
            ['saved', `저장된 설명 (${answerNotes})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-[14px] py-[10px] font-bold text-[14px] -mb-px border-b-2 ${
              tab === key ? 'border-[#f26b1d] text-[#1a1a1a]' : 'border-transparent text-[#9ca3af]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'rehearsal' && (
        <Rehearsal
          presentationId={presentationId}
          slides={slides}
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

function Rehearsal({
  presentationId,
  slides,
  onSaved,
  initialPage,
  refining,
}: {
  presentationId: string;
  slides: Slide[];
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

  function go(next: number) {
    stop();
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
    setTranscript('');
    setPartial('');
    setItems(null);
    setSavedMsg(null);
  }

  async function organize() {
    stop();
    setBusy(true);
    setError(null);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/classify`, {
        text: transcript,
        source: 'rehearsal',
        page: slide?.page,
      });
      setItems((r.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, 'rehearsal') })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '정리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!slide) return <p className="font-medium text-[14px] text-[#6b7280]">슬라이드를 불러오는 중···</p>;

  return (
    <div className="flex flex-col lg:flex-row gap-[20px] items-stretch lg:items-start">
      <div className="flex flex-col gap-[10px] w-full lg:w-[380px] shrink-0">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="border border-[#e5e7eb] h-[34px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] disabled:opacity-40"
          >
            ← 이전
          </button>
          <select
            value={index}
            onChange={(e) => go(Number(e.target.value))}
            className="border border-[#e5e7eb] h-[34px] px-[8px] rounded-[6px] text-[13px] font-bold text-[#1a1a1a]"
          >
            {slides.map((s, i) => (
              <option key={s.page} value={i}>
                p.{s.page} {s.title.slice(0, 16)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === slides.length - 1}
            className="border border-[#e5e7eb] h-[34px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] disabled:opacity-40"
          >
            다음 →
          </button>
        </div>
        <div className="bg-[#f9fafb] border border-[#e5e7eb] px-[16px] py-[14px] rounded-[6px] h-[220px] lg:h-[420px] overflow-auto">
          <p className="font-black text-[20px] text-[#1a1a1a] mb-[6px]">p.{slide.page}</p>
          <SlideText key={slide.page} raw={slide.text} refined={slide.refined} pending={refining} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[12px] min-w-0">
        <p className="font-normal text-[14px] text-[#6b7280]">
          이 슬라이드를 실제 발표하듯 설명해보세요. 슬라이드에 없는 이유, 예시, 배경을 말할수록 좋아요.
        </p>
        <div className="flex gap-[8px] items-center">
          <button
            type="button"
            onClick={() => (listening ? stop() : start())}
            className={`flex gap-[8px] h-[40px] items-center px-[16px] rounded-[6px] font-bold text-[14px] ${
              listening ? 'bg-[#bf382e] text-white' : 'bg-[#1a1a1a] text-white'
            }`}
          >
            <span className={`rounded-full size-[9px] ${listening ? 'bg-white animate-pulse' : 'bg-[#f26b1d]'}`} />
            {listening ? '녹음 멈추기' : '녹음 시작'}
          </button>
          {partial && <span className="font-medium text-[13px] text-[#9ca3af] truncate">{partial}</span>}
        </div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="말한 내용이 여기에 쌓여요. 직접 적거나 고쳐도 됩니다."
          className="border border-[#e5e7eb] min-h-[140px] px-[14px] py-[12px] rounded-[6px] text-[15px] text-[#1a1a1a] leading-[24px] outline-none resize-y"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={organize}
            disabled={!transcript.trim() || busy}
            className="bg-[#f26b1d] h-[40px] px-[18px] rounded-[6px] font-bold text-[14px] text-white disabled:opacity-40"
          >
            {busy ? 'AI가 정리하는 중···' : '정리하기'}
          </button>
        </div>
        {error && <p className="font-medium text-[13px] text-[#bf382e]">{error}</p>}
        {savedMsg && <p className="font-medium text-[13px] text-[#409959]">{savedMsg}</p>}
        {items && (
          <Review
            items={items}
            setItems={setItems}
            presentationId={presentationId}
            source="rehearsal"
            onSaved={(n, added) => {
              onSaved(n);
              setItems(null);
              setTranscript('');
              setSavedMsg(`${added}개 저장했어요. 다음 슬라이드로 넘어가도 됩니다.`);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DocInput({ presentationId, onSaved }: { presentationId: string; onSaved: (n: Note[]) => void }) {
  const [source, setSource] = useState<'script' | 'doc'>('script');
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function organizeText() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`${API_URL}/api/notes/${presentationId}/classify`, { text, source });
      setItems((r.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, source) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '정리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function organizeFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('source', source);
      const res = await fetch(`${API_URL}/api/notes/${presentationId}/classify-file`, { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? '파일을 정리하지 못했습니다');
      setItems((data.items as Item[]).map((it) => ({ ...it, checked: initialCheck(it, source) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 정리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex gap-[8px] items-center">
        {(['script', 'doc'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`h-[34px] px-[14px] rounded-[6px] font-bold text-[13px] ${
              source === s ? 'bg-[#f26b1d] text-white' : 'border border-[#e5e7eb] text-[#6b7280]'
            }`}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
        <span className="font-normal text-[13px] text-[#6b7280]">
          {source === 'script' ? '발표할 때 읽는 대본' : '기획서, 보고서, README 같은 프로젝트 설명'}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="내용을 붙여넣으세요. 슬라이드에 이미 있는 말은 자동으로 걸러집니다."
        className="border border-[#e5e7eb] min-h-[180px] px-[14px] py-[12px] rounded-[6px] text-[14px] text-[#1a1a1a] leading-[23px] outline-none resize-y"
      />
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
            className="border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[13px] text-[#6b7280]"
          >
            파일로 올리기 (txt, md, pdf)
          </button>
        </div>
        <button
          type="button"
          onClick={organizeText}
          disabled={!text.trim() || busy}
          className="bg-[#f26b1d] h-[40px] px-[18px] rounded-[6px] font-bold text-[14px] text-white disabled:opacity-40"
        >
          {busy ? 'AI가 정리하는 중···' : '정리하기'}
        </button>
      </div>
      {error && <p className="font-medium text-[13px] text-[#bf382e]">{error}</p>}
      {savedMsg && <p className="font-medium text-[13px] text-[#409959]">{savedMsg}</p>}
      {items && (
        <Review
          items={items}
          setItems={setItems}
          presentationId={presentationId}
          source={source}
          onSaved={(n, added) => {
            onSaved(n);
            setItems(null);
            setText('');
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
}: {
  items: Item[];
  setItems: (v: Item[]) => void;
  presentationId: string;
  source: 'rehearsal' | 'script' | 'doc';
  onSaved: (notes: Note[], added: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const toggle = (i: number) => setItems(items.map((it, j) => (j === i ? { ...it, checked: !it.checked } : it)));

  const main = items.map((it, i) => ({ it, i })).filter(({ it }) => (it.kind === 'explain' || it.kind === 'fact') && !it.dup);
  const hidden = items.map((it, i) => ({ it, i })).filter(({ it }) => !((it.kind === 'explain' || it.kind === 'fact') && !it.dup));
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
      onSaved(r.notes, r.added);
    } finally {
      setBusy(false);
    }
  }

  const row = ({ it, i }: { it: Item; i: number }) => (
    <label
      key={i}
      className={`flex gap-[10px] items-start px-[12px] py-[9px] rounded-[6px] border ${
        it.kind === 'fact' ? 'border-[#f26b1d] bg-[#fff8f2]' : 'border-[#e5e7eb] bg-white'
      }`}
    >
      <input type="checkbox" checked={!!it.checked} onChange={() => toggle(i)} className="mt-[4px] accent-[#f26b1d]" />
      <div className="flex flex-col gap-[3px] min-w-0">
        <div className="flex gap-[6px] items-center">
          <span className="font-bold text-[11px] text-[#6b7280]">{it.page ? `p.${it.page}` : '전체'}</span>
          <span className={`font-bold text-[11px] ${it.kind === 'fact' ? 'text-[#f26b1d]' : 'text-[#409959]'}`}>
            {it.dup ? '이미 저장됨' : KIND_LABEL[it.kind]}
          </span>
          {it.kind === 'fact' && !it.dup && (
            <span className="font-medium text-[11px] text-[#f26b1d]">
              슬라이드에 없는 내용이에요{it.new_numbers.length ? ` (${it.new_numbers.join(', ')})` : ''}. 맞는지 확인해주세요
            </span>
          )}
        </div>
        <span className="font-medium text-[14px] text-[#1a1a1a] leading-[21px]">{it.text}</span>
      </div>
    </label>
  );

  return (
    <div className="flex flex-col gap-[8px] border border-[#e5e7eb] rounded-[6px] px-[14px] py-[12px]">
      <p className="font-bold text-[14px] text-[#1a1a1a]">새로 저장될 설명 ({main.length})</p>
      {main.length === 0 && <p className="font-normal text-[13px] text-[#6b7280]">슬라이드에 없는 새 설명이 없었어요.</p>}
      {main.map(row)}
      {hidden.length > 0 && (
        <button type="button" onClick={() => setShowHidden((v) => !v)} className="self-start font-bold text-[12px] text-[#6b7280]">
          {showHidden ? '▾' : '▸'} 슬라이드에 이미 있는 말, 중복, 군말 ({hidden.length}) {showHidden ? '접기' : '보기'}
        </button>
      )}
      {showHidden && hidden.map(row)}
      <div className="flex justify-between items-center pt-[4px]">
        <span className="font-normal text-[12px] text-[#6b7280]">
          슬라이드 반복은 답변 근거가 아니라 질문을 찾는 표현으로만 저장돼요.
        </span>
        <button
          type="button"
          onClick={save}
          disabled={busy || count === 0}
          className="bg-[#1a1a1a] h-[38px] px-[16px] rounded-[6px] font-bold text-[14px] text-white disabled:opacity-40"
        >
          {busy ? '저장 중···' : `체크한 ${count}개 저장`}
        </button>
      </div>
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
    <div className="flex flex-col gap-[12px]">
      <label className="flex gap-[6px] items-center font-medium text-[13px] text-[#6b7280]">
        <input type="checkbox" checked={showRepeat} onChange={() => setShowRepeat((v) => !v)} className="accent-[#f26b1d]" />
        검색용 표현(슬라이드 반복)도 보기
      </label>
      {groups.size === 0 && <p className="font-normal text-[14px] text-[#6b7280]">아직 저장된 설명이 없어요.</p>}
      {[...groups.entries()]
        .sort((a, b) => (a[0] || 999) - (b[0] || 999))
        .map(([p, list]) => (
          <div key={p} className="flex flex-col gap-[6px]">
            <p className="font-bold text-[14px] text-[#1a1a1a]">{title(p)}</p>
            {list.map((n) => (
              <div key={n.id} className="flex gap-[10px] items-start border border-[#e5e7eb] px-[12px] py-[8px] rounded-[6px]">
                <span
                  className={`font-bold text-[11px] shrink-0 mt-[2px] ${
                    n.kind === 'fact' ? 'text-[#f26b1d]' : n.kind === 'repeat' ? 'text-[#9ca3af]' : 'text-[#409959]'
                  }`}
                >
                  {KIND_LABEL[n.kind]}
                </span>
                <span className="flex-1 font-medium text-[14px] text-[#1a1a1a] leading-[21px]">{n.text}</span>
                <span className="font-medium text-[11px] text-[#9ca3af] shrink-0 mt-[2px]">{SOURCE_LABEL[n.source]}</span>
                <button type="button" onClick={() => remove(n.id)} className="font-bold text-[12px] text-[#9ca3af] shrink-0">
                  지우기
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
