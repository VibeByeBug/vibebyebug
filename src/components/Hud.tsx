import { useState } from 'react';
import type { AnswerMode, FlowStep, QaAnswer, QaFlow, QaResult } from '../types/qa';
import type { QuestionType } from '../types/mockPractice';
import { ChevronDownIcon, MinusCircleIcon } from './icons';

const DEFAULT_VISIBLE_SOURCES = 3;
const MAX_SOURCES = 5;
const QUESTION_TYPES: QuestionType[] = ['사실확인', '절차', '근거', '한계/반론'];

interface HudProps {
  result: QaResult | null; // null 이면 서버 응답을 기다리는 중
  question: string;
  answer?: QaAnswer | null;
  flow?: QaFlow | null;
  mode?: AnswerMode;
  notice?: string | null;
  onChangeType?: (type: QuestionType) => void;
}

export function Hud({ result, question, answer = null, flow = null, mode = 'keywords', notice = null, onChangeType }: HudProps) {
  const [expanded, setExpanded] = useState(false);

  if (!result) {
    return (
      <div className="flex flex-1 flex-col gap-[24px] items-start pb-[36px] pt-[32px] px-[44px] w-full">
        <div className="flex flex-col gap-[14px] w-full">
          <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">인식된 질문</p>
          <p className="font-bold text-[44px] text-[#1a1a1a] tracking-[-1.76px] leading-[57px] w-full">{question}</p>
        </div>
        <p className={`font-medium text-[17px] ${notice ? 'text-[#bf382e]' : 'text-[#6b7280]'}`}>
          {notice ?? '근거를 찾고 있어요···'}
        </p>
      </div>
    );
  }

  // 추천 답변 모드에서 서버가 만든 답변. 끝났는데 비어 있으면(자료로 답할 수 없음, 오류) 없는 것으로 본다.
  const core = result.core ?? null;
  // 연습에서 확정한 답이 있으면 그 카드만 띄운다. 흐름도, 추천 답변은 만들지 않는다.
  const showAnswer = !core && mode === 'answer' && !(answer?.done && !answer.text);
  // 흐름도가 실패하면(자료로 답할 수 없음, 오류) 칸 대신 키워드를 보여준다
  const showFlow = !core && mode === 'flow' && !(flow?.done && flow.steps.length === 0);
  const pendingNote = result.corePending ? (
    <p className="font-medium text-[14px] text-[#6b7280]">
      ‘{result.corePending}’은 연습에서 확정한 답이 없어요. 연습 화면에서 확정하면 다음부터 바로 뜹니다.
    </p>
  ) : null;

  const sources = result.sources.slice(0, MAX_SOURCES);
  const visibleSources = expanded ? sources : sources.slice(0, DEFAULT_VISIBLE_SOURCES);
  const canExpand = sources.length > DEFAULT_VISIBLE_SOURCES;
  const isLimitation = result.type === '한계/반론';

  // 발표자가 직접 쓴 카드는 슬라이드가 없어서 근거가 0개다. 근거 없음 화면으로 보내면 안 된다.
  if (sources.length === 0 && !core) {
    return (
      <div className="flex flex-1 flex-col gap-[24px] items-start pb-[36px] pt-[32px] px-[44px] w-full">
        <div className="flex flex-col gap-[14px] w-full">
          <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">인식된 질문</p>
          <p className="font-bold text-[44px] text-[#1a1a1a] tracking-[-1.76px] leading-[57px] w-full">{question}</p>
        </div>
        <div className="bg-[#fff3eb] border border-[#e5e7eb] flex gap-[12px] items-center px-[22px] py-[20px] rounded-[6px] w-full">
          <span className="size-[20px] text-[#f26b1d] shrink-0">
            <MinusCircleIcon />
          </span>
          <p className="font-bold text-[19px] text-[#f26b1d] leading-[28px] whitespace-nowrap">
            발표자료에서 관련 근거를 찾지 못했습니다
          </p>
        </div>
        {pendingNote}
        <div className="flex flex-col gap-[12px] w-full">
          <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">추천 답변</p>
          <div className="flex flex-col gap-[10px] w-full">
            {(result.suggestions ?? []).map((s) => (
              <div key={s} className="border border-[#e5e7eb] flex items-center justify-between px-[24px] py-[22px] rounded-[6px] w-full">
                <p className="font-bold text-[24px] text-[#1a1a1a] tracking-[-0.6px] leading-[35px] whitespace-nowrap">
                  “{s}”
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[24px] items-start pb-[36px] pt-[32px] px-[44px] w-full">
      <div className="flex flex-col gap-[16px] w-full">
        <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">인식된 질문</p>
        <p className="font-bold text-[44px] text-[#1a1a1a] tracking-[-1.76px] leading-[57px] w-full">{question}</p>
        <div className="flex gap-[8px] items-start w-full">
          {QUESTION_TYPES.map((type) => {
            const active = type === result.type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChangeType?.(type)}
                className={`flex flex-col items-start px-[16px] py-[8px] rounded-[6px] self-stretch ${
                  active ? 'bg-[#f26b1d]' : 'border border-[#e5e7eb]'
                }`}
              >
                <span className={`text-[15px] whitespace-nowrap ${active ? 'font-bold text-white' : 'font-medium text-[#6b7280]'}`}>
                  {type}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {core && (
        <div className="flex flex-col gap-[12px] w-full">
          <p className="font-bold text-[11px] text-[#409959] tracking-[1.54px] w-full">
            연습에서 확정한 답 · {core.label}
            {core.edited && <span className="ml-[8px] text-[#6b7280]">발표자 수정</span>}
          </p>
          <FlowSteps steps={core.steps} />
        </div>
      )}

      {!core && pendingNote}

      {showFlow && (
        <div className="flex flex-col gap-[12px] w-full">
          <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">
            말할 순서
            {flow?.done && <span className="ml-[8px] font-medium text-[#999]">{Math.round(flow.latency_ms)}ms</span>}
          </p>
          {!flow?.steps.length ? (
            <p className="font-medium text-[17px] text-[#999]">순서를 정리하고 있어요···</p>
          ) : (
            <FlowSteps steps={flow.steps} />
          )}
          {flow?.status === 'blocked' && (
            <p className="font-normal text-[13px] text-[#6b7280]">자료에 없는 숫자가 나와서 뒤 칸은 표시하지 않았습니다.</p>
          )}
        </div>
      )}

      {showAnswer && (
        <div className="bg-[#fff3eb] border border-[#f26b1d] flex flex-col gap-[14px] px-[28px] py-[26px] rounded-[6px] w-full">
          <p className="font-bold text-[12px] text-[#f26b1d] tracking-[1.2px] w-full">
            추천 답변
            {answer?.done && <span className="ml-[8px] font-medium text-[#999]">{Math.round(answer.latency_ms)}ms</span>}
          </p>
          <p
            className={`font-bold text-[27px] tracking-[-0.675px] leading-[40px] w-full ${
              answer?.text ? 'text-[#1a1a1a]' : 'text-[#999]'
            }`}
          >
            {answer?.text ? `“${answer.text}”` : '답변을 만들고 있어요···'}
          </p>
          {answer?.status === 'blocked' && (
            <p className="font-normal text-[13px] text-[#6b7280]">
              자료에 없는 숫자가 나와서 뒷부분은 표시하지 않았습니다.
            </p>
          )}
        </div>
      )}

      {isLimitation && !showAnswer && !showFlow && !core ? (
        <div className="bg-[#fff3eb] border border-[#f26b1d] flex flex-col gap-[14px] px-[28px] py-[26px] rounded-[6px] w-full">
          <p className="font-bold text-[12px] text-[#f26b1d] tracking-[1.2px] w-full">추천 답변</p>
          <div className="flex flex-col gap-[12px] w-full">
            {(result.suggestions ?? []).map((s) => (
              <p key={s} className="font-bold text-[27px] text-[#1a1a1a] tracking-[-0.675px] leading-[40px] w-full">
                “{s}”
              </p>
            ))}
          </div>
        </div>
      ) : (
        !showFlow && !core && result.keywords.length > 0 && (
          <>
            <div className="border-t border-[#e5e7eb] flex flex-col gap-[12px] pt-[20px] w-full">
              <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">키워드</p>
              <div className="flex flex-wrap gap-[10px] w-full">
                {result.keywords.map((keyword) => (
                  <span key={keyword} className="bg-[#f26b1d] flex flex-col items-start px-[18px] py-[10px] rounded-full">
                    <span className="font-black text-[22px] text-white whitespace-nowrap">{keyword}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-[#e5e7eb] h-px w-full" />
          </>
        )
      )}

      <div
        className={`flex flex-col gap-[12px] items-start w-full ${
          isLimitation ? 'border-t border-[#e5e7eb] pt-[20px]' : ''
        }`}
      >
        {sources.length > 0 && <p className="font-bold text-[11px] text-[#6b7280] tracking-[1.54px] w-full">뒷받침 근거</p>}
        <div className="flex flex-col gap-[10px] w-full">
          {visibleSources.map((source, index) => (
            <div
              key={`${source.slide}-${index}`}
              className="border border-[#e5e7eb] flex gap-[18px] items-center px-[18px] py-[16px] rounded-[6px] w-full"
            >
              <span className="bg-[#f3f4f6] border border-[#e5e7eb] flex h-[68px] items-center justify-center rounded-[6px] shrink-0 w-[120px]">
                <span className="font-mono text-[9px] text-[#9ca3af]">p{String(source.slide).padStart(3, '0')}</span>
              </span>
              <p className="font-black text-[34px] text-[#1a1a1a] tracking-[-1.36px] shrink-0 w-[80px]">
                p.{source.slide}
              </p>
              <p className="flex-1 font-medium text-[19px] text-[#1a1a1a] leading-[28px]">“{source.quote}”</p>
            </div>
          ))}
        </div>

        <div className={`flex gap-[14px] items-center w-full ${sources.length === 0 ? 'hidden' : ''}`}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            disabled={!canExpand}
            className="border border-[#e5e7eb] flex gap-[8px] h-[46px] items-center px-[20px] rounded-[6px] disabled:opacity-40"
          >
            <span className={`size-[16px] text-[#1a1a1a] transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDownIcon />
            </span>
            <span className="font-bold text-[15px] text-[#1a1a1a] whitespace-nowrap">근거 더보기 (최대 5개)</span>
          </button>
          <p className="font-normal text-[13px] text-[#999] whitespace-nowrap">
            {isLimitation
              ? '한계 질문은 근거보다 답변 문장을 먼저 읽으세요'
              : `응답 ${result.responseMs}ms · Space 로 다음 질문 대기`}
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowSteps({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex items-stretch gap-[10px] w-full">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-1 items-center gap-[10px] min-w-0">
          <div
            className={`flex flex-1 flex-col gap-[8px] justify-between self-stretch px-[20px] py-[18px] rounded-[6px] min-w-0 ${
              i === 0 ? 'bg-[#f26b1d]' : 'bg-[#fff3eb] border border-[#f26b1d]'
            }`}
          >
            <span className={`font-bold text-[12px] ${i === 0 ? 'text-white/80' : 'text-[#f26b1d]'}`}>{i + 1}</span>
            <p
              className={`font-black text-[24px] tracking-[-0.6px] leading-[32px] break-keep ${
                i === 0 ? 'text-white' : 'text-[#1a1a1a]'
              }`}
            >
              {step.text}
            </p>
            <span className={`font-bold text-[13px] ${i === 0 ? 'text-white/80' : 'text-[#6b7280]'}`}>
              {step.slide ? `p.${step.slide}` : '발표자 작성'}
            </span>
          </div>
          {i < steps.length - 1 && <span className="font-black text-[22px] text-[#f26b1d] shrink-0">→</span>}
        </div>
      ))}
    </div>
  );
}
