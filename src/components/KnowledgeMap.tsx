import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../api';

// 프로젝트 지식 지도. 슬라이드만이 아니라 대본, 설명 자료, 리허설에서 모은 지식 조각을
// 주제 묶음별로 놓고, 조각 사이의 관계(근거, 원인, 결과 등)를 잇는다. (ai/knowledge_graph.py)

interface KNode {
  id: string;
  kind: 'slide' | 'doc' | 'script' | 'rehearsal';
  page: number | null;
  text: string;
  name: string;
  topic: string;
}
interface KEdge {
  from: string;
  to: string;
  relation: string;
  why: string;
}
interface KGraph {
  nodes: KNode[];
  edges: KEdge[];
  topics: string[];
  coverage: number;
}

const KIND: Record<KNode['kind'], { label: string; color: string }> = {
  slide: { label: '슬라이드', color: '#f26b1d' },
  doc: { label: '설명 자료', color: '#2f7a47' },
  script: { label: '발표 대본', color: '#2f6fb5' },
  rehearsal: { label: '리허설', color: '#7c5cbf' },
};
const REL_COLOR: Record<string, string> = {
  근거: '#2f6fb5',
  원인: '#bf382e',
  결과: '#2f7a47',
  방법: '#f26b1d',
  예시: '#b08400',
  한계: '#7c5cbf',
  같은내용: '#9ca3af',
};
const relColor = (r: string) => REL_COLOR[r] ?? '#9ca3af';
const source = (n: KNode) => (n.kind === 'slide' && n.page ? `p.${n.page}` : KIND[n.kind]?.label ?? '자료');

const COL_W = 212;
const NODE_W = 188;
const NODE_H = 62;
const GAP_Y = 12;
const PAD = 20;
const HEAD = 44;

export function KnowledgeMap({
  presentationId,
  onAddNote,
}: {
  presentationId: string;
  onAddNote?: (page?: number) => void;
}) {
  const [data, setData] = useState<KGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${API_URL}/api/graph/${presentationId}/knowledge`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? '지식 지도를 불러오지 못했습니다');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '지식 지도를 불러오지 못했습니다'));
  }, [presentationId]);

  // 주제 묶음별 열. 열 안에서는 슬라이드 조각을 먼저, 그다음 보강 자료.
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; col: number }>();
    if (!data) return { pos, cols: [] as string[], width: 0, height: 0 };
    const cols = [...data.topics.filter((t) => data.nodes.some((n) => n.topic === t))];
    for (const n of data.nodes) if (!cols.includes(n.topic)) cols.push(n.topic);
    let maxRows = 0;
    cols.forEach((t, c) => {
      const inCol = data.nodes
        .filter((n) => n.topic === t)
        .sort((a, b) => (a.kind === 'slide' ? 0 : 1) - (b.kind === 'slide' ? 0 : 1) || (a.page ?? 99) - (b.page ?? 99));
      maxRows = Math.max(maxRows, inCol.length);
      inCol.forEach((n, r) => pos.set(n.id, { x: PAD + c * COL_W, y: PAD + HEAD + r * (NODE_H + GAP_Y), col: c }));
    });
    return {
      pos,
      cols,
      width: PAD * 2 + cols.length * COL_W - (COL_W - NODE_W),
      height: PAD * 2 + HEAD + maxRows * (NODE_H + GAP_Y),
    };
  }, [data]);

  if (error) return <p className="py-[40px] text-center font-medium text-[15px] text-[#bf382e]">{error}</p>;
  if (!data) return <p className="py-[40px] text-center font-medium text-[15px] text-[#6b7280]">지식 지도를 불러오는 중···</p>;

  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const focus = hovered ?? selected;
  const q = query.trim();
  // 강조할 조각: 검색어가 있으면 맞는 조각, 아니면 누르거나 올린 조각과 이어진 조각
  const matches = (n: KNode) => (!q || n.text.includes(q) || n.name.includes(q)) && (!kinds.size || kinds.has(n.kind));
  const filtering = !!q || kinds.size > 0;
  const linked = (id: string) => data.edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));
  const lit = (n: KNode) => (focus ? n.id === focus || linked(n.id) : filtering ? matches(n) : true);
  const edgeLit = (e: KEdge) => !!focus && (e.from === focus || e.to === focus);

  const node = selected ? byId.get(selected) : undefined;
  const incoming = data.edges.filter((e) => e.to === selected && e.relation !== '같은내용');
  const outgoing = data.edges.filter((e) => e.from === selected && e.relation !== '같은내용');
  const same = data.edges.filter((e) => e.relation === '같은내용' && (e.from === selected || e.to === selected));
  const count = (k: string) => data.nodes.filter((n) => n.kind === k).length;

  function pick(id: string) {
    setSelected(selected === id ? null : id);
  }

  function edgePath(e: KEdge) {
    const a = layout.pos.get(e.from);
    const b = layout.pos.get(e.to);
    if (!a || !b) return null;
    if (a.col === b.col) {
      const x = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const y2 = b.y + NODE_H / 2;
      const bulge = 22 + Math.abs(y2 - y1) * 0.12;
      return `M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x},${y2}`;
    }
    const [l, r] = a.col < b.col ? [a, b] : [b, a];
    const x1 = l.x + NODE_W;
    const y1 = l.y + NODE_H / 2;
    const x2 = r.x;
    const y2 = r.y + NODE_H / 2;
    const dx = (x2 - x1) / 2;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }

  const chip = (id: string, strong = false) => {
    const n = byId.get(id);
    if (!n) return null;
    return (
      <button
        key={id}
        type="button"
        onClick={() => pick(id)}
        className={`inline-flex items-center gap-[6px] max-w-full h-[26px] px-[9px] rounded-full border text-[12px] font-bold ${
          strong ? 'border-[#f26b1d] bg-[#fff3eb] text-[#c2410c]' : 'border-[#e5e7eb] bg-white text-[#374151]'
        }`}
      >
        <span className="size-[7px] rounded-full shrink-0" style={{ background: KIND[n.kind]?.color }} />
        <span className="truncate">{n.name}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-[16px]">
      {/* 통계와 거르기 */}
      <div className="flex flex-col items-center gap-[10px]">
        <div className="flex flex-wrap justify-center gap-[8px]">
          <Pill label="지식 조각" value={`${data.nodes.length}개`} />
          <Pill label="연결" value={`${data.edges.length}개`} />
          <Pill label="주제 묶음" value={`${layout.cols.length}개`} />
          {data.coverage < 0.8 && (
            <span className="inline-flex items-center h-[28px] px-[10px] rounded-full text-[12px] font-bold bg-[#fff3eb] text-[#c2410c]">
              새로 더한 자료가 많아요. 자료 보강 화면에서 "지식 지도 다시 만들기"를 눌러주세요
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-center items-center gap-[6px]">
          {(Object.keys(KIND) as KNode['kind'][])
            .filter((k) => count(k) > 0)
            .map((k) => {
              const on = kinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const next = new Set(kinds);
                    if (on) next.delete(k);
                    else next.add(k);
                    setKinds(next);
                  }}
                  className={`inline-flex items-center gap-[6px] h-[28px] px-[11px] rounded-full border text-[12px] font-bold ${
                    on ? 'text-white' : 'bg-white text-[#374151] border-[#e5e7eb]'
                  }`}
                  style={on ? { background: KIND[k].color, borderColor: KIND[k].color } : undefined}
                >
                  <span className="size-[8px] rounded-full" style={{ background: on ? '#fff' : KIND[k].color }} />
                  {KIND[k].label} {count(k)}
                </button>
              );
            })}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="낱말로 찾기 (예: 정확도)"
            className="h-[28px] w-[200px] px-[12px] rounded-full border border-[#e5e7eb] text-[12px] outline-none focus:border-[#f26b1d]"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[20px] items-stretch lg:items-start">
        {/* 지도: 주제 묶음별 열, 조각 카드, 관계 선 */}
        <div className="flex-1 min-w-0 border border-[#e5e7eb] rounded-[12px] overflow-auto bg-[#fcfcfd]">
          <div className="relative" style={{ width: layout.width, height: layout.height }} onClick={() => setSelected(null)}>
            {layout.cols.map((t, c) => (
              <div
                key={t}
                className="absolute rounded-[10px] bg-[#f3f4f6]/70"
                style={{ left: PAD + c * COL_W - 8, top: PAD - 6, width: NODE_W + 16, height: layout.height - PAD * 2 + 12 }}
              >
                <p className="pt-[10px] text-center font-bold text-[13px] text-[#111111] truncate px-[8px]">{t}</p>
              </div>
            ))}
            <svg className="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height}>
              {[...data.edges]
                .sort((a, b) => Number(edgeLit(a)) - Number(edgeLit(b)))
                .map((e, i) => {
                  const d = edgePath(e);
                  if (!d) return null;
                  const on = edgeLit(e);
                  return (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={relColor(e.relation)}
                      strokeWidth={on ? 2.4 : 1.2}
                      strokeDasharray={e.relation === '같은내용' ? '4 4' : undefined}
                      opacity={focus ? (on ? 1 : 0.06) : filtering ? 0.08 : 0.28}
                    />
                  );
                })}
            </svg>
            {data.nodes.map((n) => {
              const p = layout.pos.get(n.id);
              if (!p) return null;
              const isSel = selected === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    pick(n.id);
                  }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`absolute flex overflow-hidden rounded-[8px] bg-white text-left transition-opacity ${
                    isSel ? 'ring-2 ring-[#f26b1d] shadow-[0_8px_20px_-8px_rgba(242,107,29,0.5)]' : 'border border-[#e5e7eb]'
                  }`}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H, opacity: lit(n) ? 1 : 0.28 }}
                >
                  <span className="w-[5px] shrink-0" style={{ background: KIND[n.kind]?.color }} />
                  <span className="flex flex-col gap-[2px] px-[9px] py-[7px] min-w-0">
                    <span className="font-mono font-bold text-[10px] tracking-[1px]" style={{ color: KIND[n.kind]?.color }}>
                      {source(n)}
                    </span>
                    <span className="font-bold text-[13px] text-[#111111] leading-[17px] line-clamp-2 break-keep">{n.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 누른 조각 */}
        <div className="flex flex-col gap-[14px] border border-[#e5e7eb] rounded-[12px] px-[18px] py-[18px] w-full lg:w-[360px] shrink-0 bg-white lg:sticky lg:top-[16px]">
          {node ? (
            <>
              <div className="flex flex-col gap-[6px] items-center text-center">
                <span
                  className="px-[10px] py-[2px] rounded-full font-bold text-[11px] text-white"
                  style={{ background: KIND[node.kind]?.color }}
                >
                  {KIND[node.kind]?.label}
                  {node.page ? `  p.${node.page}` : ''}
                </span>
                <p className="font-black text-[19px] text-[#111111] break-keep">{node.name}</p>
                <p className="font-bold text-[12px] text-[#9ca3af]">{node.topic}</p>
              </div>
              <p className="font-normal text-[13px] text-[#374151] leading-[20px] bg-[#f9fafb] rounded-[8px] px-[12px] py-[10px] max-h-[200px] overflow-auto whitespace-pre-line">
                {node.text.replace(/ \/ /g, '\n')}
              </p>

              {(incoming.length > 0 || outgoing.length > 0) && (
                <div className="flex flex-col gap-[8px] items-center bg-[#fff8f3] border border-[#fbd5bd] rounded-[8px] px-[12px] py-[11px]">
                  <p className="font-bold text-[12px] text-[#c2410c]">이 내용을 물으면 이렇게 엮어서</p>
                  <div className="flex items-center gap-[8px] max-w-full">
                    {incoming.length > 0 && (
                      <>
                        <div className="flex flex-col gap-[4px] items-end min-w-0">{incoming.slice(0, 3).map((e) => chip(e.from))}</div>
                        <span className="font-black text-[14px] text-[#f26b1d] shrink-0">→</span>
                      </>
                    )}
                    <div className="shrink-0 max-w-[120px]">{chip(node.id, true)}</div>
                    {outgoing.length > 0 && (
                      <>
                        <span className="font-black text-[14px] text-[#f26b1d] shrink-0">→</span>
                        <div className="flex flex-col gap-[4px] items-start min-w-0">{outgoing.slice(0, 3).map((e) => chip(e.to))}</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Links title="받쳐주는 내용" edges={incoming} side="from" byId={byId} onPick={pick} />
              <Links title="이어지는 내용" edges={outgoing} side="to" byId={byId} onPick={pick} />
              {same.length > 0 && (
                <div className="flex flex-col gap-[6px]">
                  <p className="font-bold text-[12px] text-[#6b7280] text-center">다른 자료에서 같은 내용 ({same.length})</p>
                  <div className="flex flex-wrap justify-center gap-[6px]">
                    {same.map((e) => chip(e.from === node.id ? e.to : e.from))}
                  </div>
                </div>
              )}
              {onAddNote && node.kind === 'slide' && node.page && (
                <button
                  type="button"
                  onClick={() => onAddNote(node.page ?? undefined)}
                  className="self-center bg-[#111111] h-[32px] px-[14px] rounded-[6px] font-bold text-[13px] text-white"
                >
                  이 슬라이드 설명 더 녹음하기
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-[12px] items-center text-center">
              <p className="font-bold text-[16px] text-[#111111]">이렇게 쓰세요</p>
              <p className="font-normal text-[13px] text-[#4b5563] leading-[21px]">
                발표에 대해 아는 내용을 주제별로 모았어요. 조각을 누르면 그 내용을 물었을 때 같이 엮을 내용이 보여요.
              </p>
              <p className="font-normal text-[13px] text-[#4b5563] leading-[21px]">
                색은 어디서 온 내용인지예요. 슬라이드에 없는 설명(초록, 파랑, 보라)이 많을수록 "왜" 질문에 깊게 답할 수 있어요.
              </p>
              <div className="flex flex-wrap justify-center gap-[6px] pt-[4px]">
                {Object.entries(REL_COLOR).map(([r, col]) => (
                  <span key={r} className="inline-flex items-center gap-[5px] text-[11px] font-bold text-[#6b7280]">
                    <span className="w-[14px] h-[3px] rounded-full" style={{ background: col }} />
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-full text-[12px] bg-[#f3f4f6] text-[#4b5563]">
      <span className="font-medium">{label}</span>
      <span className="font-black">{value}</span>
    </span>
  );
}

function Links({
  title,
  edges,
  side,
  byId,
  onPick,
}: {
  title: string;
  edges: KEdge[];
  side: 'from' | 'to';
  byId: Map<string, KNode>;
  onPick: (id: string) => void;
}) {
  if (!edges.length) return null;
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="font-bold text-[12px] text-[#6b7280] text-center">
        {title} ({edges.length})
      </p>
      {edges.map((e, i) => {
        const other = side === 'from' ? e.from : e.to;
        const n = byId.get(other);
        if (!n) return null;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(other)}
            className="flex gap-[10px] items-start text-left px-[10px] py-[8px] rounded-[8px] border border-[#f3f4f6] hover:border-[#e5e7eb] hover:bg-[#fafafa]"
          >
            <span
              className="shrink-0 mt-[1px] px-[7px] py-[1px] rounded-full font-bold text-[11px] text-white"
              style={{ background: relColor(e.relation) }}
            >
              {e.relation}
            </span>
            <span className="flex flex-col gap-[2px] min-w-0">
              <span className="font-bold text-[13px] text-[#1a1a1a] break-keep">
                <span className="font-mono text-[11px] mr-[6px]" style={{ color: KIND[n.kind]?.color }}>
                  {source(n)}
                </span>
                {n.name}
              </span>
              {e.why && <span className="font-normal text-[12px] text-[#6b7280] leading-[17px] break-keep">{e.why}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
