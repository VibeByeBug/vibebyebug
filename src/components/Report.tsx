import { useEffect, useState } from 'react';
import { getQaLogs, type QaLogRow } from '../api';

// 사후 리포트: 실전에서 받은 질문 기록을 그대로 보여준다.
// 숫자는 모두 data/qa_log.jsonl 에서 온다. 기록이 없으면 없다고 말한다.

interface ReportProps {
  presentationName: string;
  presentationId?: string;
}

const STATUS_LABEL: Record<string, string> = { ok: '근거 표시', no_evidence: '근거 없음', ignored: '잡음 무시' };
const STATUS_COLOR: Record<string, string> = { ok: '#f26b1d', no_evidence: '#f8a876', ignored: 'rgba(255,255,255,0.25)' };

export function Report({ presentationName, presentationId }: ReportProps) {
  const [logs, setLogs] = useState<QaLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!presentationId) {
      setLogs([]);
      return;
    }
    let stop = false;
    getQaLogs(presentationId)
      .then((rows) => !stop && setLogs(rows))
      .catch((e) => !stop && setError(e instanceof Error ? e.message : '기록을 불러오지 못했습니다'));
    return () => {
      stop = true;
    };
  }, [presentationId]);

  if (error) return <Empty title={error} />;
  if (!logs) return <Empty title="기록을 불러오는 중···" />;
  if (logs.length === 0)
    return (
      <Empty
        title="아직 이 발표의 Q&A 기록이 없어요"
        sub={presentationId ? '실전 화면에서 질문을 받으면 여기에 쌓여요.' : '발표를 열고 질문을 받으면 여기에 쌓여요.'}
      />
    );

  const total = logs.length;
  const counts = { ok: 0, no_evidence: 0, ignored: 0 } as Record<string, number>;
  const byType = new Map<string, number>();
  let latSum = 0;
  let latN = 0;
  for (const r of logs) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    const t = r.qtype || '미분류';
    byType.set(t, (byType.get(t) ?? 0) + 1);
    if (r.status === 'ok' && typeof r.latency_ms === 'number') {
      latSum += r.latency_ms;
      latN += 1;
    }
  }
  const avg = latN ? Math.round(latSum / latN) : null;
  const typeMax = Math.max(...byType.values());
  const day = new Date(logs[logs.length - 1].at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="flex flex-1 flex-col gap-[26px] items-start px-[16px] sm:px-[44px] py-[34px] w-full max-w-[1200px] mx-auto">
      <div className="flex flex-col gap-[6px] items-center text-center w-full">
        <p className="font-black text-[30px] text-white tracking-[-0.84px] leading-[38px] w-full break-keep">{presentationName}</p>
        <p className="font-normal text-[14px] text-white/55 w-full">
          {day}, 질문 {total}건{avg !== null && `, 근거 평균 응답 ${avg}ms`}
        </p>
      </div>

      <div className="flex flex-col gap-[14px] items-start w-full">
        <p className="font-bold text-[15px] text-white w-full">처리 결과</p>
        <div className="border border-white/12 flex h-[44px] overflow-hidden rounded-[8px] w-full">
          {(['ok', 'no_evidence', 'ignored'] as const).map((k) =>
            counts[k] ? (
              <div
                key={k}
                className="flex h-full items-center justify-center px-[10px]"
                style={{ width: `${pct(counts[k])}%`, background: STATUS_COLOR[k] }}
              >
                <p className={`font-bold text-[14px] whitespace-nowrap ${k === 'ignored' ? 'text-white' : 'text-[#2b1508]'}`}>
                  {counts[k]}건, {pct(counts[k])}%
                </p>
              </div>
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-[20px] items-start w-full">
          {(['ok', 'no_evidence', 'ignored'] as const).map((k) => (
            <div key={k} className="flex gap-[8px] items-center">
              <span className="rounded-[2px] size-[10px]" style={{ background: STATUS_COLOR[k] }} />
              <p className="font-medium text-[13px] text-white/55 whitespace-nowrap">{STATUS_LABEL[k]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[20px] items-stretch w-full">
        <div className="border border-white/12 bg-[#1c1713] flex flex-col gap-[10px] justify-center px-[26px] py-[24px] rounded-[10px] lg:w-[380px]">
          <p className="font-bold text-[14px] text-white/55 w-full">근거를 찾은 비율</p>
          <div className="flex gap-[12px] items-baseline w-full whitespace-nowrap">
            <p className="font-black text-[72px] text-[#f26b1d] tracking-[-4px] leading-none">{pct(counts.ok)}%</p>
            <p className="font-bold text-[20px] text-white/55">
              {counts.ok} / {total}
            </p>
          </div>
          <p className="font-normal text-[14px] text-white/55 leading-[22px] w-full break-keep">
            근거를 못 찾은 질문은 자료 보강에서 설명을 더하면 다음 발표에서 답할 수 있어요.
          </p>
        </div>
        <div className="border border-white/12 bg-[#1c1713] flex flex-1 flex-col gap-[16px] px-[26px] py-[24px] rounded-[10px]">
          <p className="font-bold text-[15px] text-white w-full">질문 유형 분포</p>
          <div className="flex flex-col gap-[13px] w-full">
            {[...byType.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex gap-[14px] items-center w-full">
                  <p className="font-medium text-[14px] text-white/55 w-[76px] shrink-0">{type}</p>
                  <div className="bg-white/10 flex flex-1 h-[10px] overflow-hidden rounded-[5px]">
                    <div className="bg-[#f26b1d] h-[10px] rounded-[5px]" style={{ width: `${(count / typeMax) * 100}%` }} />
                  </div>
                  <p className="font-bold text-[14px] text-white text-right w-[44px]">{count}건</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[12px] items-start w-full">
        <div className="flex items-baseline justify-between w-full">
          <p className="font-bold text-[15px] text-white">받은 질문</p>
          <p className="font-normal text-[13px] text-white/45">최근 질문부터</p>
        </div>
        <div className="flex flex-col w-full">
          {[...logs].reverse().map((r, i) => (
            <div key={`${r.at}-${i}`} className="border-t border-white/10 flex flex-wrap gap-[14px] items-center px-[4px] py-[12px] w-full">
              <span className="font-mono text-[12px] text-white/40 w-[52px] shrink-0">{r.at.slice(11, 16)}</span>
              <span
                className="font-bold text-[12px] shrink-0 w-[64px]"
                style={{ color: r.status === 'ok' ? '#7ee2a0' : r.status === 'no_evidence' ? '#ff9a5c' : 'rgba(255,255,255,0.4)' }}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              <p className="flex-1 min-w-[200px] font-medium text-[16px] text-white break-keep">{r.question}</p>
              <span className="font-medium text-[13px] text-white/45 shrink-0">{r.qtype}</span>
              <span className="font-mono text-[13px] text-white/45 shrink-0 w-[70px] text-right">
                {r.slides?.length ? `p.${r.slides.join(', ')}` : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-[8px] items-center justify-center px-[24px] py-[80px] text-center">
      <p className="font-bold text-[20px] text-white break-keep">{title}</p>
      {sub && <p className="font-medium text-[14px] text-white/50 break-keep">{sub}</p>}
    </div>
  );
}
