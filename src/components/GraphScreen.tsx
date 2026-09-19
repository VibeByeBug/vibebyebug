import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../api';

interface GraphNode {
  page: number;
  role: string;
  title: string;
  text?: string;
  notes?: string[]; // 이 슬라이드에 붙은 발표자 설명
}
interface GraphEdge {
  from: number;
  to: number;
  relation: string;
  why: string;
}
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  story: { text: string; pages: number[] }[];
  general_notes?: string[];
}

// 발표 흐름 순서로 열을 나눈다. 같은 역할의 슬라이드는 한 열에 위아래로 쌓인다.
const ROLE_ORDER = ['소개', '문제', '근거', '방법', '결과', '한계', '제안'];
const ROLE_COLOR: Record<string, string> = {
  소개: '#9ca3af',
  문제: '#bf382e',
  근거: '#2f6fb5',
  방법: '#f26b1d',
  결과: '#409959',
  한계: '#7c5cbf',
  제안: '#b08400',
};
// 연결 종류별 색. 선 색만 보고도 "근거로 받치는 선"인지 "순서로 이어지는 선"인지 구분되게 한다.
const REL_COLOR: Record<string, string> = {
  근거: '#2f6fb5',
  원인: '#bf382e',
  방법: '#f26b1d',
  결과: '#409959',
  예시: '#b08400',
  한계: '#7c5cbf',
  이어짐: '#9ca3af',
};
const relColor = (r: string) => REL_COLOR[r] ?? '#9ca3af';
const roleColor = (r: string) => ROLE_COLOR[r] ?? '#9ca3af';

const COL_W = 196;
const ROW_H = 80;
const NODE_W = 156;
const NODE_H = 58;
const PAD = 24;
const HEAD = 40; // 열 이름 자리

// 제목을 두 줄로 자른다 (SVG 는 자동 줄바꿈이 없다)
function twoLines(title: string, max = 10): [string, string] {
  if (title.length <= max) return [title, ''];
  const cut = title.lastIndexOf(' ', max);
  const at = cut > 3 ? cut : max;
  const rest = title.slice(at).trim();
  return [title.slice(0, at).trim(), rest.length > max ? `${rest.slice(0, max - 1)}…` : rest];
}

export function GraphScreen({
  presentationId,
  onBack,
  onAddNote,
}: {
  presentationId: string;
  onBack: () => void;
  onAddNote?: (page?: number) => void; // 자료 보강 화면 열기 (슬라이드를 주면 그 슬라이드부터)
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [storyAt, setStoryAt] = useState<number | null>(null);
  const [relFilter, setRelFilter] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/graph/${presentationId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? '논리 지도를 불러오지 못했습니다');
        return r.json();
      })
      .then(setGraph)
      .catch((e) => setError(e instanceof Error ? e.message : '논리 지도를 불러오지 못했습니다'));
  }, [presentationId]);

  // 연결이 하나도 없는 슬라이드(표지, 목차, 감사 인사)는 지도에서 빼고 아래에 따로 적는다
  const { linked, loose } = useMemo(() => {
    if (!graph) return { linked: [] as GraphNode[], loose: [] as GraphNode[] };
    const has = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
    return {
      linked: graph.nodes.filter((n) => has.has(n.page)),
      loose: graph.nodes.filter((n) => !has.has(n.page)),
    };
  }, [graph]);

  // 역할별 열, 열 안에서는 슬라이드 순서
  const layout = useMemo(() => {
    const pos = new Map<number, { x: number; y: number; col: number }>();
    const cols = ROLE_ORDER.filter((r) => linked.some((n) => n.role === r));
    let maxRows = 0;
    cols.forEach((role, c) => {
      const inCol = linked.filter((n) => n.role === role).sort((a, b) => a.page - b.page);
      maxRows = Math.max(maxRows, inCol.length);
      inCol.forEach((n, r) => pos.set(n.page, { x: PAD + c * COL_W, y: PAD + HEAD + r * ROW_H, col: c }));
    });
    return {
      pos,
      cols,
      width: PAD * 2 + Math.max(cols.length, 1) * COL_W - (COL_W - NODE_W),
      height: PAD * 2 + HEAD + maxRows * ROW_H,
    };
  }, [linked]);

  if (error)
    return (
      <div className="flex flex-col gap-[14px] p-[44px]">
        <p className="font-medium text-[15px] text-[#bf382e]">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="self-start border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280]"
        >
          돌아가기
        </button>
      </div>
    );
  if (!graph) return <p className="p-[44px] font-medium text-[15px] text-[#6b7280]">논리 지도를 불러오는 중···</p>;

  const byPage = new Map(graph.nodes.map((n) => [n.page, n]));
  const focus = hovered ?? selected;
  // 강조할 슬라이드: 줄거리를 눌렀으면 그 단계의 슬라이드, 슬라이드를 눌렀거나 올렸으면 그 슬라이드
  const highlight = new Set<number>(
    storyAt != null ? graph.story[storyAt]?.pages ?? [] : focus != null ? [focus] : [],
  );
  const edgeOn = (e: GraphEdge) =>
    (relFilter == null || e.relation === relFilter) &&
    (highlight.size === 0 || highlight.has(e.from) || highlight.has(e.to));
  const dimming = highlight.size > 0 || relFilter != null;
  const nodeOn = (p: number) =>
    !dimming || highlight.has(p) || graph.edges.some((e) => edgeOn(e) && (e.from === p || e.to === p));

  const node = selected != null ? byPage.get(selected) : undefined;
  const incoming = graph.edges.filter((e) => e.to === selected);
  const outgoing = graph.edges.filter((e) => e.from === selected);
  const relations = Array.from(new Set(graph.edges.map((e) => e.relation)));
  const noted = graph.nodes.filter((n) => n.notes?.length).length;
  // 연결은 많은데 설명이 없는 슬라이드. 질문이 몰릴 곳이라 설명을 먼저 채우면 좋다.
  const degree = (p: number) => graph.edges.filter((e) => e.from === p || e.to === p).length;
  const needNotes = linked
    .filter((n) => !n.notes?.length && n.role !== '소개')
    .sort((a, b) => degree(b.page) - degree(a.page))
    .slice(0, 4);

  function pick(p: number) {
    setStoryAt(null);
    setShowText(false);
    setSelected(selected === p ? null : p);
  }

  // 선 모양: 오른쪽 열로 가면 옆으로, 같은 열이면 오른쪽으로 휘고, 왼쪽 열로 돌아가면 위로 크게 돈다
  function edgePath(e: GraphEdge) {
    const a = layout.pos.get(e.from);
    const b = layout.pos.get(e.to);
    if (!a || !b) return null;
    if (b.col > a.col) {
      const x1 = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x;
      const y2 = b.y + NODE_H / 2;
      const dx = (x2 - x1) * 0.5;
      return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` };
    }
    if (b.col === a.col) {
      const x = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const y2 = b.y + NODE_H / 2;
      const bulge = 26 + Math.abs(y2 - y1) * 0.15;
      return { d: `M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x},${y2}` };
    }
    const x1 = a.x + NODE_W / 2;
    const y1 = a.y;
    const x2 = b.x + NODE_W / 2;
    const y2 = b.y;
    const top = Math.min(y1, y2) - 30;
    return { d: `M${x1},${y1} C${x1},${top} ${x2},${top} ${x2},${y2}` };
  }

  const pageChip = (p: number, strong = false, withTitle = true) => {
    const n = byPage.get(p);
    return (
      <button
        key={p}
        type="button"
        onClick={() => pick(p)}
        className={`inline-flex items-center gap-[5px] h-[26px] px-[9px] rounded-full border text-[12px] font-bold whitespace-nowrap ${
          strong ? 'border-[#f26b1d] bg-[#fff3eb] text-[#c2410c]' : 'border-[#e5e7eb] bg-white text-[#374151]'
        }`}
      >
        <span className="size-[7px] rounded-full" style={{ background: roleColor(n?.role ?? '') }} />
        p.{p}
        {withTitle && n?.title && <span className="font-medium text-[#6b7280]">{n.title}</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-[22px] pb-[48px] pt-[28px] px-[16px] md:px-[44px] w-full max-w-[1400px] mx-auto">
      {/* 머리말 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-[14px]">
        <div className="flex flex-col gap-[8px]">
          <p className="font-bold text-[26px] text-[#1a1a1a] tracking-[-0.6px]">발표 논리 지도</p>
          <p className="font-normal text-[14px] text-[#6b7280] leading-[21px] max-w-[720px]">
            슬라이드 사이의 주장과 근거를 이은 지도입니다. 질문이 들어오면 실전 답변은 이 연결을 따라 여러 슬라이드를 함께
            봅니다. 슬라이드를 누르면 어떤 슬라이드와 엮어 답하면 되는지 보여줍니다.
          </p>
          <div className="flex flex-wrap gap-[8px] pt-[2px]">
            <Stat label="슬라이드" value={`${graph.nodes.length}장`} />
            <Stat label="연결" value={`${graph.edges.length}개`} />
            <Stat
              label="설명 붙은 슬라이드"
              value={`${noted} / ${graph.nodes.length}`}
              tone={noted ? 'green' : 'gray'}
            />
            {!!graph.general_notes?.length && <Stat label="프로젝트 전체 설명" value={`${graph.general_notes.length}개`} tone="green" />}
          </div>
        </div>
        <div className="flex gap-[8px] shrink-0">
          {onAddNote && (
            <button
              type="button"
              onClick={() => onAddNote()}
              className="border border-[#f26b1d] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#f26b1d] whitespace-nowrap"
            >
              자료 보강
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280] whitespace-nowrap"
          >
            돌아가기
          </button>
        </div>
      </div>

      {/* 발표 줄거리: 번호를 이은 단계. 누르면 그 단계의 슬라이드가 지도에서 강조된다 */}
      <div className="flex flex-col gap-[10px]">
        <SectionTitle>발표 줄거리</SectionTitle>
        <div className="flex overflow-x-auto pb-[4px]">
          {graph.story.map((s, i) => {
            const on = storyAt === i;
            return (
              <div key={i} className="flex items-stretch flex-1 min-w-[180px]">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setStoryAt(on ? null : i);
                  }}
                  className={`flex flex-col gap-[8px] flex-1 min-w-0 px-[14px] py-[12px] rounded-[8px] text-left transition-colors ${
                    on ? 'bg-[#fff3eb] border-2 border-[#f26b1d]' : 'bg-white border border-[#e5e7eb] hover:border-[#f7a978]'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center size-[24px] rounded-full font-black text-[12px] ${
                      on ? 'bg-[#f26b1d] text-white' : 'bg-[#f3f4f6] text-[#6b7280]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="font-semibold text-[13px] text-[#1a1a1a] leading-[19px] break-keep flex-1">{s.text}</span>
                  <span className="font-bold text-[11px] text-[#9ca3af]">{s.pages.map((p) => `p.${p}`).join(', ')}</span>
                </button>
                {i < graph.story.length - 1 && (
                  <div className="flex items-center w-[16px] shrink-0">
                    <div className="h-[2px] flex-1 bg-[#e5e7eb]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[20px] items-stretch lg:items-start">
        {/* 지도 */}
        <div className="flex flex-col gap-[10px] flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <SectionTitle>연결 지도</SectionTitle>
            <div className="flex flex-wrap gap-[6px]">
              {relations.map((r) => {
                const on = relFilter === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRelFilter(on ? null : r)}
                    className={`inline-flex items-center gap-[6px] h-[26px] px-[10px] rounded-full border text-[12px] font-bold ${
                      on ? 'text-white' : 'bg-white text-[#374151] border-[#e5e7eb]'
                    }`}
                    style={on ? { background: relColor(r), borderColor: relColor(r) } : undefined}
                  >
                    <span className="w-[14px] h-[3px] rounded-full" style={{ background: on ? '#fff' : relColor(r) }} />
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border border-[#e5e7eb] rounded-[10px] overflow-auto bg-[#fcfcfd]">
            {/* 화면 폭에 맞춰 줄이되, 너무 작아지면 글자가 안 보이므로 가로 스크롤로 넘긴다 */}
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width="100%"
              className="block"
              style={{ maxWidth: layout.width, minWidth: Math.min(layout.width, 640) }}
              onClick={() => setSelected(null)}
            >
              <defs>
                {Object.entries({ ...REL_COLOR, 기타: '#9ca3af' }).map(([r, c]) => (
                  <marker
                    key={r}
                    id={`arrow-${r}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={c} />
                  </marker>
                ))}
              </defs>

              {/* 역할 열 배경과 이름 */}
              {layout.cols.map((role, c) => (
                <g key={role}>
                  <rect
                    x={PAD + c * COL_W - 10}
                    y={PAD - 6}
                    width={NODE_W + 20}
                    height={layout.height - PAD * 2 + 12}
                    rx="10"
                    fill={roleColor(role)}
                    opacity="0.05"
                  />
                  <text
                    x={PAD + c * COL_W + NODE_W / 2}
                    y={PAD + 16}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="800"
                    fill={roleColor(role)}
                  >
                    {role}
                  </text>
                </g>
              ))}

              {/* 연결선. 강조된 선은 위에 그리고 관계 이름을 붙인다 */}
              {[...graph.edges]
                .sort((a, b) => Number(edgeOn(a)) - Number(edgeOn(b)))
                .map((e, i) => {
                  const path = edgePath(e);
                  if (!path) return null;
                  const on = edgeOn(e);
                  const strong = on && dimming;
                  const color = relColor(e.relation);
                  return (
                    <g key={`${e.from}-${e.to}-${i}`} opacity={on ? 1 : 0.12}>
                      <path
                        d={path.d}
                        fill="none"
                        stroke={color}
                        strokeWidth={strong ? 2.6 : 1.6}
                        strokeDasharray={e.relation === '이어짐' ? '5 4' : undefined}
                        markerEnd={`url(#arrow-${REL_COLOR[e.relation] ? e.relation : '기타'})`}
                      >
                        <title>{`p.${e.from} → p.${e.to} ${e.relation}: ${e.why}`}</title>
                      </path>
                    </g>
                  );
                })}

              {/* 슬라이드 칸 */}
              {linked.map((n) => {
                const p = layout.pos.get(n.page);
                if (!p) return null;
                const lit = highlight.has(n.page);
                const isSel = selected === n.page;
                const [l1, l2] = twoLines(n.title);
                const noteCount = n.notes?.length ?? 0;
                return (
                  <g
                    key={n.page}
                    transform={`translate(${p.x},${p.y})`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      pick(n.page);
                    }}
                    onMouseEnter={() => setHovered(n.page)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer' }}
                    opacity={nodeOn(n.page) ? 1 : 0.3}
                  >
                    {isSel && <rect x="-4" y="-4" width={NODE_W + 8} height={NODE_H + 8} rx="11" fill="#f26b1d" opacity="0.15" />}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="8"
                      fill={lit ? '#fff8f3' : '#ffffff'}
                      stroke={lit ? '#f26b1d' : '#e5e7eb'}
                      strokeWidth={lit ? 2 : 1}
                    />
                    <rect width="5" height={NODE_H} rx="2.5" fill={roleColor(n.role)} />
                    <text x="14" y="18" fontSize="11" fontWeight="800" fill={roleColor(n.role)}>
                      p.{n.page}
                    </text>
                    {noteCount > 0 && (
                      <g transform={`translate(${NODE_W - 10},12)`}>
                        <rect x={-40} y="-8" width="40" height="16" rx="8" fill="#e8f5ec" />
                        <text x="-20" y="4" textAnchor="middle" fontSize="10" fontWeight="800" fill="#2f7a47">
                          설명 {noteCount}
                        </text>
                      </g>
                    )}
                    <text x="14" y={l2 ? 35 : 40} fontSize="13" fontWeight="700" fill="#1a1a1a">
                      {l1}
                    </text>
                    {l2 && (
                      <text x="14" y="50" fontSize="13" fontWeight="700" fill="#1a1a1a">
                        {l2}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          {loose.length > 0 && (
            <p className="font-normal text-[12px] text-[#9ca3af]">
              연결이 없는 슬라이드: {loose.map((n) => `p.${n.page} ${n.title}`).join(', ')}
            </p>
          )}
        </div>

        {/* 오른쪽: 누른 슬라이드로 답할 때 엮을 슬라이드 */}
        <div className="flex flex-col gap-[14px] border border-[#e5e7eb] rounded-[10px] px-[18px] py-[18px] w-full lg:w-[360px] shrink-0 bg-white lg:sticky lg:top-[16px]">
          {node ? (
            <>
              <div className="flex flex-col gap-[6px]">
                <div className="flex gap-[8px] items-center">
                  <span
                    className="px-[9px] py-[2px] rounded-full font-bold text-[11px] text-white"
                    style={{ background: roleColor(node.role) }}
                  >
                    {node.role}
                  </span>
                  <span className="font-black text-[15px] text-[#9ca3af]">p.{node.page}</span>
                </div>
                <p className="font-bold text-[19px] text-[#1a1a1a] tracking-[-0.3px] break-keep">{node.title}</p>
              </div>

              {/* 이 슬라이드를 물으면 어떤 순서로 엮어 말하나 */}
              {(incoming.length > 0 || outgoing.length > 0) && (
                <div className="flex flex-col gap-[8px] bg-[#fff8f3] border border-[#fbd5bd] rounded-[8px] px-[12px] py-[11px]">
                  <p className="font-bold text-[12px] text-[#c2410c]">이 슬라이드를 물으면 이렇게 엮어서</p>
                  <div className="flex items-center gap-[8px]">
                    {incoming.length > 0 && (
                      <>
                        <div className="flex flex-col gap-[4px] items-start min-w-0">
                          {incoming.map((e) => pageChip(e.from, false, false))}
                        </div>
                        <span className="font-black text-[14px] text-[#f26b1d] shrink-0">→</span>
                      </>
                    )}
                    <div className="shrink-0">{pageChip(node.page, true, false)}</div>
                    {outgoing.length > 0 && (
                      <>
                        <span className="font-black text-[14px] text-[#f26b1d] shrink-0">→</span>
                        <div className="flex flex-col gap-[4px] items-start min-w-0">
                          {outgoing.map((e) => pageChip(e.to, false, false))}
                        </div>
                      </>
                    )}
                  </div>
                  <p className="font-normal text-[12px] text-[#6b7280] leading-[18px]">
                    {incoming.length > 0 ? '받쳐주는 슬라이드로 이유를 대고, ' : ''}
                    {outgoing.length > 0 ? '이어지는 슬라이드로 결과까지 말하면 됩니다.' : '이 슬라이드로 결론을 맺으면 됩니다.'}
                  </p>
                </div>
              )}

              <EdgeList title="이 슬라이드를 받쳐주는 슬라이드" edges={incoming} side="from" byPage={byPage} onPick={pick} />
              <EdgeList title="이 슬라이드에서 이어지는 슬라이드" edges={outgoing} side="to" byPage={byPage} onPick={pick} />

              {/* 발표자 설명 */}
              {node.notes?.length ? (
                <div className="flex flex-col gap-[6px] bg-[#f3faf5] border border-[#b7dfc3] px-[12px] py-[10px] rounded-[8px]">
                  <p className="font-bold text-[12px] text-[#2f7a47]">발표자 설명 {node.notes.length}개</p>
                  {node.notes.map((t, i) => (
                    <p key={i} className="font-medium text-[13px] text-[#1a1a1a] leading-[19px] break-keep">
                      {t}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-[8px] bg-[#f9fafb] border border-dashed border-[#d1d5db] px-[12px] py-[11px] rounded-[8px]">
                  <p className="font-medium text-[13px] text-[#6b7280] leading-[19px]">
                    아직 슬라이드에 없는 설명이 없어요. "왜 이렇게 했나요" 같은 질문에 대비해 이유나 배경을 채워두면 답변이 깊어집니다.
                  </p>
                  {onAddNote && (
                    <button
                      type="button"
                      onClick={() => onAddNote(node.page)}
                      className="self-start bg-[#1a1a1a] h-[32px] px-[12px] rounded-[6px] font-bold text-[13px] text-white"
                    >
                      이 슬라이드 설명 추가
                    </button>
                  )}
                </div>
              )}

              {node.text && (
                <div className="flex flex-col gap-[6px]">
                  <button
                    type="button"
                    onClick={() => setShowText((v) => !v)}
                    className="self-start font-bold text-[12px] text-[#6b7280]"
                  >
                    {showText ? '▾ 슬라이드 원문 접기' : '▸ 슬라이드 원문 보기'}
                  </button>
                  {showText && (
                    <p className="font-normal text-[13px] text-[#4b5563] leading-[20px] whitespace-pre-line max-h-[220px] overflow-auto bg-[#f9fafb] rounded-[6px] px-[10px] py-[8px]">
                      {node.text}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="font-bold text-[16px] text-[#1a1a1a]">이렇게 쓰세요</p>
              <ol className="flex flex-col gap-[8px] font-normal text-[13px] text-[#4b5563] leading-[20px] list-decimal pl-[18px]">
                <li>슬라이드를 누르면 그 슬라이드를 물었을 때 같이 엮을 슬라이드가 보입니다.</li>
                <li>위 줄거리를 누르면 발표의 그 단계에 해당하는 슬라이드가 강조됩니다.</li>
                <li>지도 위 연결 종류를 누르면 그 종류의 선만 남깁니다.</li>
              </ol>
              {needNotes.length > 0 && (
                <div className="flex flex-col gap-[8px] border-t border-[#f3f4f6] pt-[12px]">
                  <p className="font-bold text-[13px] text-[#1a1a1a]">설명을 먼저 채우면 좋은 슬라이드</p>
                  <p className="font-normal text-[12px] text-[#6b7280] leading-[18px]">
                    다른 슬라이드와 많이 이어져 질문이 몰리기 쉬운데 아직 발표자 설명이 없습니다.
                  </p>
                  <div className="flex flex-wrap gap-[6px]">{needNotes.map((n) => pageChip(n.page))}</div>
                </div>
              )}
              {!!graph.general_notes?.length && (
                <div className="flex flex-col gap-[6px] border-t border-[#f3f4f6] pt-[12px]">
                  <p className="font-bold text-[13px] text-[#2f7a47]">프로젝트 전체 설명 {graph.general_notes.length}개</p>
                  {graph.general_notes.slice(0, 4).map((t, i) => (
                    <p key={i} className="font-medium text-[12px] text-[#374151] leading-[18px] break-keep">
                      {t}
                    </p>
                  ))}
                  {graph.general_notes.length > 4 && (
                    <p className="font-normal text-[12px] text-[#9ca3af]">외 {graph.general_notes.length - 4}개</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-bold text-[12px] text-[#6b7280] tracking-[1px]">{children}</p>;
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'green' }) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] h-[28px] px-[10px] rounded-full text-[12px] ${
        tone === 'green' ? 'bg-[#e8f5ec] text-[#2f7a47]' : 'bg-[#f3f4f6] text-[#4b5563]'
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="font-black">{value}</span>
    </span>
  );
}

function EdgeList({
  title,
  edges,
  side,
  byPage,
  onPick,
}: {
  title: string;
  edges: GraphEdge[];
  side: 'from' | 'to';
  byPage: Map<number, GraphNode>;
  onPick: (p: number) => void;
}) {
  if (!edges.length) return null;
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="font-bold text-[12px] text-[#6b7280]">
        {title} ({edges.length})
      </p>
      {edges.map((e, i) => {
        const other = side === 'from' ? e.from : e.to;
        const n = byPage.get(other);
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
              <span className="font-bold text-[13px] text-[#1a1a1a]">
                p.{other} {n?.title}
              </span>
              <span className="font-normal text-[12px] text-[#6b7280] leading-[17px] break-keep">{e.why}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
