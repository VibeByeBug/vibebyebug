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

const COL_W = 170;
const ROW_H = 64;
const NODE_W = 140;
const NODE_H = 44;
const PAD = 30;

export function GraphScreen({ presentationId, onBack }: { presentationId: string; onBack: () => void }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [storyAt, setStoryAt] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/graph/${presentationId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? '논리 지도를 불러오지 못했습니다');
        return r.json();
      })
      .then(setGraph)
      .catch((e) => setError(e instanceof Error ? e.message : '논리 지도를 불러오지 못했습니다'));
  }, [presentationId]);

  // 역할별 열, 열 안에서는 슬라이드 순서
  const layout = useMemo(() => {
    const pos = new Map<number, { x: number; y: number }>();
    if (!graph) return { pos, width: 0, height: 0, cols: [] as string[] };
    const cols = ROLE_ORDER.filter((r) => graph.nodes.some((n) => n.role === r));
    let maxRows = 0;
    cols.forEach((role, c) => {
      const inCol = graph.nodes.filter((n) => n.role === role).sort((a, b) => a.page - b.page);
      maxRows = Math.max(maxRows, inCol.length);
      inCol.forEach((n, r) => pos.set(n.page, { x: PAD + c * COL_W, y: PAD + 26 + r * ROW_H }));
    });
    return { pos, width: PAD * 2 + cols.length * COL_W, height: PAD * 2 + 26 + maxRows * ROW_H, cols };
  }, [graph]);

  if (error) return <p className="p-[44px] font-medium text-[15px] text-[#bf382e]">{error}</p>;
  if (!graph) return <p className="p-[44px] font-medium text-[15px] text-[#6b7280]">논리 지도를 불러오는 중···</p>;

  const highlight = new Set<number>(
    storyAt != null ? graph.story[storyAt]?.pages ?? [] : selected != null ? [selected] : [],
  );
  const related = (e: GraphEdge) => highlight.has(e.from) || highlight.has(e.to);
  const node = graph.nodes.find((n) => n.page === selected);
  const nodeEdges = graph.edges.filter((e) => e.from === selected || e.to === selected);

  return (
    <div className="flex flex-col gap-[20px] pb-[40px] pt-[28px] px-[44px] w-full">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-[6px]">
          <p className="font-bold text-[24px] text-[#1a1a1a] tracking-[-0.6px]">발표 논리 지도</p>
          <p className="font-normal text-[14px] text-[#6b7280]">
            AI가 발표자료를 읽고 슬라이드 사이의 주장과 근거를 이었습니다. 실전 답변은 이 연결을 따라 여러 슬라이드를 함께 봅니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="border border-[#e5e7eb] h-[38px] px-[14px] rounded-[6px] font-bold text-[14px] text-[#6b7280] shrink-0"
        >
          돌아가기
        </button>
      </div>

      {/* 발표 줄거리. 누르면 그 단계의 슬라이드가 지도에서 강조된다 */}
      <div className="flex flex-col gap-[6px]">
        <p className="font-bold text-[12px] text-[#6b7280] tracking-[1px]">발표 줄거리</p>
        <div className="flex flex-wrap gap-[8px]">
          {graph.story.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelected(null);
                setStoryAt(storyAt === i ? null : i);
              }}
              className={`flex gap-[8px] items-start px-[12px] py-[8px] rounded-[6px] text-left max-w-[420px] ${
                storyAt === i ? 'bg-[#fff3eb] border border-[#f26b1d]' : 'border border-[#e5e7eb]'
              }`}
            >
              <span className="font-black text-[13px] text-[#f26b1d]">{i + 1}</span>
              <span className="font-medium text-[13px] text-[#1a1a1a] leading-[19px]">{s.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-[20px] items-start">
        <div className="border border-[#e5e7eb] rounded-[6px] overflow-auto flex-1">
          <svg width={layout.width} height={layout.height} className="block">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#9ca3af" />
              </marker>
              <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#f26b1d" />
              </marker>
            </defs>

            {layout.cols.map((role, c) => (
              <text
                key={role}
                x={PAD + c * COL_W + NODE_W / 2}
                y={PAD + 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill={ROLE_COLOR[role]}
              >
                {role}
              </text>
            ))}

            {graph.edges.map((e, i) => {
              const a = layout.pos.get(e.from);
              const b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const on = highlight.size > 0 && related(e);
              const x1 = a.x + NODE_W / 2;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x + NODE_W / 2;
              const y2 = b.y + NODE_H / 2;
              // 같은 열이면 옆으로 휘게, 다른 열이면 가운데로 살짝 휘게
              const dx = x2 - x1;
              const cx = dx === 0 ? x1 + NODE_W * 0.8 : (x1 + x2) / 2;
              const cy = dx === 0 ? (y1 + y2) / 2 : (y1 + y2) / 2 - 24;
              return (
                <g key={i} opacity={highlight.size > 0 && !on ? 0.15 : 1}>
                  <path
                    d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`}
                    fill="none"
                    stroke={on ? '#f26b1d' : '#c4c8cf'}
                    strokeWidth={on ? 2.2 : 1.4}
                    markerEnd={on ? 'url(#arrow-on)' : 'url(#arrow)'}
                  />
                  {on && (
                    <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f26b1d">
                      {e.relation}
                    </text>
                  )}
                </g>
              );
            })}

            {graph.nodes.map((n) => {
              const p = layout.pos.get(n.page);
              if (!p) return null;
              const dim = highlight.size > 0 && !highlight.has(n.page) && !graph.edges.some(
                (e) => related(e) && (e.from === n.page || e.to === n.page),
              );
              return (
                <g
                  key={n.page}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => {
                    setStoryAt(null);
                    setSelected(selected === n.page ? null : n.page);
                  }}
                  style={{ cursor: 'pointer' }}
                  opacity={dim ? 0.3 : 1}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="6"
                    fill={highlight.has(n.page) ? '#fff3eb' : '#ffffff'}
                    stroke={highlight.has(n.page) ? '#f26b1d' : ROLE_COLOR[n.role] ?? '#9ca3af'}
                    strokeWidth={highlight.has(n.page) ? 2 : 1.2}
                  />
                  <text x="10" y="17" fontSize="11" fontWeight="800" fill={ROLE_COLOR[n.role] ?? '#9ca3af'}>
                    p.{n.page}
                  </text>
                  {!!n.notes?.length && (
                    <text x={NODE_W - 8} y="17" fontSize="10" fontWeight="800" fill="#409959" textAnchor="end">
                      설명 {n.notes.length}
                    </text>
                  )}
                  <text x="10" y="33" fontSize="12" fontWeight="700" fill="#1a1a1a">
                    {n.title.length > 11 ? `${n.title.slice(0, 11)}…` : n.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 점을 누르면 그 슬라이드와 연결 이유 */}
        <div className="border border-[#e5e7eb] flex flex-col gap-[12px] px-[18px] py-[16px] rounded-[6px] w-[320px] shrink-0">
          {node ? (
            <>
              <div className="flex gap-[8px] items-center">
                <span
                  className="px-[8px] py-[2px] rounded-full font-bold text-[11px] text-white"
                  style={{ background: ROLE_COLOR[node.role] ?? '#9ca3af' }}
                >
                  {node.role}
                </span>
                <span className="font-black text-[18px] text-[#1a1a1a]">p.{node.page}</span>
              </div>
              <p className="font-bold text-[16px] text-[#1a1a1a]">{node.title}</p>
              <p className="font-normal text-[13px] text-[#4b5563] leading-[20px] whitespace-pre-line max-h-[180px] overflow-auto">
                {node.text}
              </p>
              {!!node.notes?.length && (
                <div className="flex flex-col gap-[4px] bg-[#f3faf5] border border-[#409959] px-[10px] py-[8px] rounded-[6px]">
                  <p className="font-bold text-[12px] text-[#409959]">발표자 설명 ({node.notes.length})</p>
                  {node.notes.map((t, i) => (
                    <p key={i} className="font-medium text-[13px] text-[#1a1a1a] leading-[19px]">
                      {t}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-[6px]">
                <p className="font-bold text-[12px] text-[#6b7280]">연결 ({nodeEdges.length})</p>
                {nodeEdges.map((e, i) => (
                  <p key={i} className="font-medium text-[13px] text-[#1a1a1a] leading-[19px]">
                    <span className="font-bold text-[#f26b1d]">
                      p.{e.from} → p.{e.to} {e.relation}
                    </span>{' '}
                    {e.why}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <p className="font-normal text-[13px] text-[#6b7280] leading-[20px]">
              슬라이드를 누르면 내용과 연결 이유가 보입니다. 위의 줄거리를 누르면 그 단계의 슬라이드가 강조됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
