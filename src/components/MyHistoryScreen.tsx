import { useEffect, useState } from 'react';
import { listPresentations, listQaSessions, type QaSession, type SavedPresentation } from '../api';

// 내 기록: 실전에서 Q&A 를 받은 발표 목록. 숫자는 모두 data/qa_log.jsonl 에서 온다.
// 발표 이름은 발표 목록(/api/upload/list)에서 가져온다.

interface MyHistoryScreenProps {
  onOpenReport: (presentationId: string, title: string) => void;
}

interface Row extends QaSession {
  title: string;
}

export function MyHistoryScreen({ onOpenReport }: MyHistoryScreenProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    Promise.all([listQaSessions(), listPresentations().catch(() => [] as SavedPresentation[])])
      .then(([sessions, files]) => {
        if (stop) return;
        const title = new Map(files.map((f) => [f.presentation_id, f.title]));
        setRows(sessions.map((s) => ({ ...s, title: title.get(s.presentation_id) ?? '지워진 발표' })));
      })
      .catch((e) => !stop && setError(e instanceof Error ? e.message : '기록을 불러오지 못했습니다'));
    return () => {
      stop = true;
    };
  }, []);

  const totalQuestions = rows?.reduce((n, r) => n + r.total, 0) ?? 0;
  const answered = rows?.reduce((n, r) => n + r.answered, 0) ?? 0;

  return (
    <div className="flex flex-col gap-[30px] items-start pb-[44px] pt-[34px] px-[16px] sm:px-[44px] w-full max-w-[1200px] mx-auto">
      <div className="border-b border-white/10 flex flex-wrap gap-[36px] items-center pb-[22px] w-full">
        <div className="flex gap-[14px] items-center">
          <span className="bg-white/10 border border-white/12 flex items-center justify-center rounded-full shrink-0 size-[48px]">
            <span className="font-bold text-[17px] text-white/70">사</span>
          </span>
          <div className="flex flex-col gap-[5px]">
            <p className="font-bold text-[24px] text-white tracking-[-0.72px] whitespace-nowrap">사용자</p>
            <p className="font-normal text-[13px] text-white/50 whitespace-nowrap">user@gmail.com</p>
          </div>
        </div>
        <div className="border-l border-white/10 flex gap-[36px] pl-[28px]">
          <div className="flex flex-col gap-[6px]">
            <p className="font-medium text-[13px] text-white/50 whitespace-nowrap">Q&A 를 받은 발표</p>
            <p className="font-black text-[30px] text-white whitespace-nowrap">{rows?.length ?? 0}회</p>
          </div>
          <div className="flex flex-col gap-[6px]">
            <p className="font-medium text-[13px] text-white/50 whitespace-nowrap">받은 질문</p>
            <p className="font-black text-[30px] text-white whitespace-nowrap">{totalQuestions}건</p>
          </div>
          <div className="flex flex-col gap-[6px]">
            <p className="font-medium text-[13px] text-white/50 whitespace-nowrap">근거를 찾은 질문</p>
            <p className="font-black text-[30px] text-[#f26b1d] whitespace-nowrap">
              {totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-bold text-[17px] text-white">발표별 기록</p>
        {error && <p className="font-medium text-[14px] text-[#ff7a70]">{error}</p>}
        {!error && rows?.length === 0 && (
          <p className="font-medium text-[14px] text-white/50">
            아직 실전에서 받은 질문이 없어요. 실전 화면에서 질문을 받으면 여기에 쌓여요.
          </p>
        )}
        <div className="flex flex-col w-full">
          {rows?.map((r) => (
            <button
              key={r.presentation_id}
              type="button"
              onClick={() => onOpenReport(r.presentation_id, r.title)}
              className="border-t border-white/10 flex flex-wrap gap-[16px] items-center px-[4px] py-[16px] w-full text-left hover:bg-white/[0.04]"
            >
              <div className="flex flex-col gap-[4px] flex-1 min-w-[220px]">
                <p className="font-bold text-[18px] text-white break-keep">{r.title}</p>
                <p className="font-normal text-[13px] text-white/45">
                  {new Date(r.last_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-[28px] items-center">
                <Stat label="질문" value={`${r.total}건`} />
                <Stat label="근거 표시" value={`${r.total ? Math.round((r.answered / r.total) * 100) : 0}%`} highlight />
                <Stat label="근거 없음" value={`${r.no_evidence}건`} />
                <Stat label="평균 응답" value={r.avg_latency_ms !== null ? `${Math.round(r.avg_latency_ms)}ms` : '-'} />
              </div>
              <span className="font-bold text-[14px] text-white/50 shrink-0">리포트 보기 →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-[3px] items-end">
      <p className="font-medium text-[12px] text-white/45 whitespace-nowrap">{label}</p>
      <p className={`font-black text-[20px] whitespace-nowrap ${highlight ? 'text-[#f26b1d]' : 'text-white'}`}>{value}</p>
    </div>
  );
}
