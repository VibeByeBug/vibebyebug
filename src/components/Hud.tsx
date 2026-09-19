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
  cueNo?: number; // 몇 번째 질문인지 (슬레이트의 CUE 번호)
}

export function Hud({
  result,
  question,
  answer = null,
  flow = null,
  mode = 'keywords',
  notice = null,
  onChangeType,
  cueNo,
}: HudProps) {
  // 질문 머리: CUE 번호와 질문. 가운데 정렬, 새 질문이면 아래에서 올라온다.
  const cueLabel = `CUE ${String(cueNo ?? 1).padStart(2, '0')}   /   질문 인식`;
  const questionHead = (
    <div key={question} className="rise-in flex flex-col gap-[12px] items-center text-center w-full">
      <p className="font-mono font-bold text-[12px] text-[#f26b1d] tracking-[3px]">{cueLabel}</p>
      <p className="font-black text-[42px] text-white tracking-[-1.5px] leading-[54px] max-w-[1100px] break-keep">
        {question}
      </p>
    </div>
  );
  const [expanded, setExpanded] = useState(false);
  // 뒷받침 근거는 접어둔다. 필요할 때만 펼쳐서 슬라이드 원문을 확인한다.
  const [sourcesOpen, setSourcesOpen] = useState(false);

  if (!result) {
    return (
      <div className="relative flex flex-1 flex-col w-full bg-[#15110d] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% -120px, rgba(255,181,71,0.13), transparent 70%)' }}
      />
      <div className="relative flex flex-1 flex-col gap-[26px] items-center pb-[36px] pt-[34px] px-[44px] w-full max-w-[1320px] mx-auto">
        {questionHead}
        <p className={`font-medium text-[17px] text-center ${notice ? 'text-[#ff7a70]' : 'text-white/55'}`}>
          {notice ?? '근거를 찾고 있어요···'}
        </p>
      </div>
      </div>
    );
  }

  // 추천 답변 모드에서 서버가 만든 답변. 끝났는데 비어 있으면(자료로 답할 수 없음, 오류) 없는 것으로 본다.
  const core = result.core ?? null;
  // 연습에서 확정한 답이 있으면 그 카드만 띄운다. 흐름도, 추천 답변은 만들지 않는다.
  const showAnswer = !core && mode === 'answer' && !(answer?.done && !answer.text);
  // 흐름도가 실패하면(자료로 답할 수 없음, 오류) 칸 대신 키워드를 보여준다
  const showFlow = !core && mode === 'flow' && !(flow?.done && flow.steps.length === 0);
  // 답변 확정 화면을 뺐으므로 "연습에서 확정한 답이 없어요" 안내도 띄우지 않는다
  const pendingNote = null;

  const sources = result.sources.slice(0, MAX_SOURCES);
  const visibleSources = expanded ? sources : sources.slice(0, DEFAULT_VISIBLE_SOURCES);
  const canExpand = sources.length > DEFAULT_VISIBLE_SOURCES;
  const isLimitation = result.type === '한계/반론';

  // 흐름도와 추천 답변 칸. 슬라이드 근거가 없을 때(보강 자료로 만든 답)도 같은 모양으로 보여준다.
  const flowSection = (
      <div className="flex flex-col gap-[12px] w-full">
        <p className="font-mono font-bold text-[12px] text-white/50 tracking-[3px] w-full text-center">
          SHOT LIST  /  말할 순서
          {flow?.done && <span className="ml-[8px] font-medium text-white/35">{Math.round(flow.latency_ms)}ms</span>}
          <BasisTag basis={flow?.basis} />
        </p>
        {!flow?.steps.length ? (
          <p className="font-medium text-[17px] text-white/45 text-center">순서를 정리하고 있어요···</p>
        ) : (
          <FlowSteps steps={flow.steps} inferred={flow.basis === 'inferred'} dark />
        )}
        {flow?.guide && (
          <div className="rise-in bg-white/[0.05] border border-white/10 flex flex-col gap-[6px] items-center text-center px-[24px] py-[14px] rounded-[10px] w-full">
            <p className="font-mono font-bold text-[11px] text-[#f26b1d] tracking-[3px]">DIRECTOR&apos;S NOTE  /  이렇게 답해보세요</p>
            <p className="font-bold text-[18px] text-white leading-[27px] break-keep">{flow.guide}</p>
          </div>
        )}
        {flow?.status === 'blocked' && (
          <p className="font-normal text-[13px] text-white/50 text-center">자료에 없는 숫자가 나와서 뒤 칸은 표시하지 않았습니다.</p>
        )}
      </div>
  );
  const answerSection = (
      <div className="rise-in bg-[#1e1914] border-2 border-[#f26b1d] flex flex-col gap-[14px] items-center text-center px-[36px] py-[28px] rounded-[12px] w-full">
        <p className="font-mono font-bold text-[12px] text-[#f26b1d] tracking-[3px] w-full">
          TAKE  /  추천 답변
          {answer?.done && <span className="ml-[8px] font-medium text-white/35">{Math.round(answer.latency_ms)}ms</span>}
          <BasisTag basis={answer?.basis} />
        </p>
        <p
          className={`font-bold text-[27px] tracking-[-0.675px] leading-[40px] w-full break-keep ${
            answer?.text ? 'text-white' : 'text-white/45'
          }`}
        >
          {answer?.text ? (
            <>
              “<HighlightMany text={answer.text} words={result.keywords} />”
            </>
          ) : (
            '답변을 만들고 있어요···'
          )}
        </p>
        {answer?.status === 'blocked' && (
          <p className="font-normal text-[13px] text-white/50">
            자료에 없는 숫자가 나와서 뒷부분은 표시하지 않았습니다.
          </p>
        )}
      </div>
  );

  // 발표자가 직접 쓴 카드는 슬라이드가 없어서 근거가 0개다. 근거 없음 화면으로 보내면 안 된다.
  // 슬라이드에서 근거를 못 찾았어도 보강 자료와 논리 지도로 만든 답이 오면 그걸 보여준다
  // 근거 카드가 없어도 서버가 자료를 엮어 만든 답(흐름도, 추천 답변)이 오면 무조건 보여준다.
  // 전에는 "보강 자료로 만든 답" 표시가 붙은 답만 보여줘서, 슬라이드 조각이 섞여 만들어진 답은
  // 화면에서 버려지고 "근거를 찾지 못했습니다" 만 떴다. 키워드 모드에서도 이 경우 추천 답변이 온다.
  const useFlow = mode === 'flow';
  const fromNotes = useFlow ? !!flow && flow.steps.length > 0 : !!answer?.text;
  // 아직 만드는 중: 흐름도 모드는 흐름도가 끝나기 전, 나머지는 답변이 오고 있는데 안 끝났을 때
  const building = useFlow ? !flow?.done : mode === 'answer' ? !answer?.done : !!answer && !answer.done;
  const inferred = (useFlow ? flow?.basis : answer?.basis) === 'inferred';
  if (sources.length === 0 && !core) {
    return (
      <div className="relative flex flex-1 flex-col w-full bg-[#15110d] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% -120px, rgba(255,181,71,0.13), transparent 70%)' }}
      />
      <div className="relative flex flex-1 flex-col gap-[26px] items-center pb-[36px] pt-[34px] px-[44px] w-full max-w-[1320px] mx-auto">
        {questionHead}
        <div className="bg-white/[0.05] border border-white/10 flex gap-[12px] items-center justify-center text-center px-[22px] py-[16px] rounded-[10px] w-full">
          {!fromNotes && !building && (
            <span className="size-[20px] text-[#f26b1d] shrink-0">
              <MinusCircleIcon />
            </span>
          )}
          <div className="flex flex-col gap-[2px]">
            <p className="font-bold text-[18px] text-white leading-[27px]">
              {fromNotes
                ? inferred
                  ? '어느 자료에도 직접 답이 없어서 AI 가 추론한 답이에요'
                  : '슬라이드에 딱 맞는 근거 카드는 없지만, 자료를 엮어 답을 만들었어요'
                : building
                  ? '슬라이드에 딱 맞는 근거가 없어서 전체 자료에서 답을 찾고 있어요···'
                  : '어느 자료에서도 답을 찾지 못했습니다'}
            </p>
            {fromNotes && (
              <p className="font-medium text-[14px] text-white/55 leading-[20px]">
                {inferred ? '사실인지 확인하고 말해주세요.' : '슬라이드, 대본, 설명 자료, 논리 지도를 함께 봤어요. 한 번 더 확인하고 말해주세요.'}
              </p>
            )}
          </div>
        </div>
        {pendingNote}
        {fromNotes && (useFlow ? flowSection : answerSection)}
        {!fromNotes && !building && <div className="flex flex-col gap-[12px] w-full">
          <p className="font-mono font-bold text-[12px] text-white/50 tracking-[3px] w-full text-center">이렇게 넘기세요</p>
          <div className="flex flex-col gap-[10px] w-full">
            {(result.suggestions ?? []).map((s) => (
              <div key={s} className="bg-[#1e1914] border border-white/10 flex items-center justify-center px-[24px] py-[20px] rounded-[10px] w-full">
                <p className="font-bold text-[24px] text-white tracking-[-0.6px] leading-[35px] whitespace-nowrap">
                  “{s}”
                </p>
              </div>
            ))}
          </div>
        </div>}
      </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col w-full bg-[#15110d] text-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 520px at 50% -120px, rgba(255,181,71,0.13), transparent 70%)' }}
      />
      <div className="relative flex flex-1 flex-col gap-[26px] items-center pb-[36px] pt-[34px] px-[44px] w-full max-w-[1320px] mx-auto">
      <div className="flex flex-col gap-[16px] items-center w-full">
        {questionHead}
        <div className="flex gap-[8px] items-start justify-center w-full">
          {QUESTION_TYPES.map((type) => {
            const active = type === result.type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChangeType?.(type)}
                className={`flex flex-col items-center px-[16px] py-[7px] rounded-full self-stretch transition-colors ${
                  active ? 'bg-[#f26b1d]' : 'border border-white/20 hover:border-white/60'
                }`}
              >
                <span className={`text-[15px] whitespace-nowrap ${active ? 'font-bold text-white' : 'font-medium text-white/60'}`}>
                  {type}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {core && (
        <div className="flex flex-col gap-[12px] w-full">
          <p className="font-bold text-[11px] text-[#7ee2a0] tracking-[1.54px] w-full text-center">
            연습에서 확정한 답  /  {core.label}
            {core.source === 'answer' ? (
              <span className="ml-[8px] text-white/50">연습에서 내가 한 답</span>
            ) : (
              core.edited && <span className="ml-[8px] text-white/50">발표자 수정</span>
            )}
          </p>
          <FlowSteps steps={core.steps} dark />
        </div>
      )}

      {!core && pendingNote}

      {showFlow && flowSection}

      {showAnswer && answerSection}

      {isLimitation && !showAnswer && !showFlow && !core ? (
        <div className="bg-[#1e1914] border-2 border-[#f26b1d] flex flex-col gap-[14px] items-center text-center px-[36px] py-[26px] rounded-[12px] w-full">
          <p className="font-mono font-bold text-[12px] text-[#f26b1d] tracking-[3px] w-full">추천 답변</p>
          <div className="flex flex-col gap-[12px] w-full">
            {(result.suggestions ?? []).map((s) => (
              <p key={s} className="font-bold text-[27px] text-white tracking-[-0.675px] leading-[40px] w-full">
                “{s}”
              </p>
            ))}
          </div>
        </div>
      ) : (
        !showFlow && !core && result.keywords.length > 0 && (
          <>
            <div className="flex flex-col gap-[12px] items-center pt-[4px] w-full">
              <p className="font-mono font-bold text-[12px] text-white/50 tracking-[3px]">KEYWORDS  /  키워드</p>
              <div className="flex flex-wrap gap-[10px] justify-center w-full">
                {result.keywords.map((keyword, i) => (
                  <span
                    key={keyword}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="shot-in bg-[#f26b1d] flex flex-col items-center px-[20px] py-[10px] rounded-full"
                  >
                    <span className="font-black text-[22px] text-white whitespace-nowrap">{keyword}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white/10 h-px w-full" />
          </>
        )
      )}

      <div
        className={`flex flex-col gap-[12px] items-center w-full ${
          isLimitation ? 'border-t border-white/10 pt-[20px]' : ''
        }`}
      >
        {sources.length > 0 && (
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="flex gap-[8px] items-center"
          >
            <span className={`size-[14px] text-white/55 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`}>
              <ChevronDownIcon />
            </span>
            <span className="font-bold text-[13px] text-white/55 tracking-[0.5px]">
              뒷받침 근거 ({sources.length}개) {sourcesOpen ? '접기' : '펼치기'}
            </span>
          </button>
        )}
        {sourcesOpen && (
          <>
            <div className="flex flex-col gap-[10px] w-full">
              {visibleSources.map((source, index) => (
                <div
                  key={`${source.slide}-${index}`}
                  className="bg-[#1e1914] border border-white/10 flex gap-[18px] items-center px-[18px] py-[16px] rounded-[8px] w-full"
                >
                  <span className="bg-[#0b0907] border border-white/10 flex h-[68px] items-center justify-center rounded-[6px] shrink-0 w-[120px]">
                    <span className="font-mono text-[9px] text-white/40">p{String(source.slide).padStart(3, '0')}</span>
                  </span>
                  <p className="font-black text-[34px] text-[#f26b1d] tracking-[-1.36px] shrink-0 w-[80px]">
                    p.{source.slide}
                  </p>
                  <p className="flex-1 font-medium text-[19px] text-white/90 leading-[28px]">“{source.quote}”</p>
                </div>
              ))}
            </div>

            <div className={`flex gap-[14px] items-center justify-center w-full ${!canExpand ? 'hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="border border-white/20 flex gap-[8px] h-[40px] items-center px-[16px] rounded-[6px]"
              >
                <span className={`size-[16px] text-white transition-transform ${expanded ? 'rotate-180' : ''}`}>
                  <ChevronDownIcon />
                </span>
                <span className="font-bold text-[14px] text-white whitespace-nowrap">근거 더보기 (최대 5개)</span>
              </button>
            </div>
          </>
        )}
        <div className={`flex gap-[14px] items-center justify-center w-full ${sources.length === 0 ? 'hidden' : ''}`}>
          <p className="font-normal text-[13px] text-white/35 whitespace-nowrap">
            {isLimitation
              ? '한계 질문은 근거보다 답변 문장을 먼저 읽으세요'
              : `응답 ${result.responseMs}ms   /   Space 로 다음 질문 대기`}
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}

// 핵심 단어만 글자 색을 바꾼다. 칸 전체를 다 읽지 않아도 숫자와 요점이 먼저 눈에 들어오게.
// 여러 단어를 한 번에 강조한다. 추천 답변에서 키워드와 숫자에 색을 입힌다.
// AI 를 다시 부르지 않고, 이미 받은 키워드와 답변 속 숫자만 쓴다.
const NUM_WITH_UNIT = /(?<![A-Za-z\d])\d[\d,.~]*(?![A-Za-z])\s*(?:%|배|[가-힣]{1,2}(?=[\s,.)]|$))?/g; // B2B 의 2 는 빼고

function HighlightMany({ text, words }: { text: string; words: string[] }) {
  const ranges: [number, number][] = [];
  for (const w of words) {
    if (w.length < 2) continue;
    let at = text.indexOf(w);
    while (at >= 0) {
      ranges.push([at, at + w.length]);
      at = text.indexOf(w, at + w.length);
    }
  }
  for (const m of text.matchAll(NUM_WITH_UNIT)) ranges.push([m.index!, m.index! + m[0].trimEnd().length]);
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a < pos) continue; // 겹치는 강조는 앞의 것만
    out.push(text.slice(pos, a), <span key={a} style={{ color: '#ffb547' }}>{text.slice(a, b)}</span>);
    pos = b;
  }
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function FlowSteps({
  steps,
  inferred = false,
  dark = false,
}: {
  steps: FlowStep[];
  inferred?: boolean;
  dark?: boolean; // 실전 화면(검은 무대)용 색
}) {
  // 흰 바탕과 검은 무대에서 쓸 색. 첫 칸(주황으로 채움)은 둘 다 같다.
  const c = dark
    ? {
        card: 'bg-[#1e1914] border-2 border-[#f26b1d]/70',
        guessCard: 'bg-[#221a33] border-2 border-dashed border-[#9f86e0]',
        holes: 'text-white/15',
        guessHoles: 'text-[#9f86e0]/35',
        shot: 'text-[#f26b1d]',
        guessShot: 'text-[#c4b1f5]',
        page: 'text-white/45',
        title: 'text-white',
        detail: 'text-white/75',
        mark: '#ffb547',
        chip: 'bg-[#f26b1d]/20 text-[#ffb08a]',
        why: 'text-white/50',
      }
    : {
        card: 'bg-white border-2 border-[#f26b1d]',
        guessCard: 'bg-[#f8f5fe] border-2 border-dashed border-[#7c5cbf]',
        holes: 'text-[#f26b1d]/25',
        guessHoles: 'text-[#7c5cbf]/25',
        shot: 'text-[#f26b1d]',
        guessShot: 'text-[#5b3fa0]',
        page: 'text-[#9ca3af]',
        title: 'text-[#111111]',
        detail: 'text-[#374151]',
        mark: '#e0470f',
        chip: 'bg-[#f3f4f6] text-[#c2410c]',
        why: 'text-[#6b7280]',
      };
  return (
    <div className="flex items-stretch w-full">
      {steps.map((step, i) => {
        const guess = inferred && !step.slide; // AI 가 추론한 칸 (근거 슬라이드 없음)
        // 첫 칸은 주황으로 채워 강조한다. 추론한 칸은 보라 칸이라 주황 강조를 쓰지 않는다.
        const first = i === 0 && !guess;
        const words = step.keys?.length ? step.keys : step.key ? [step.key] : [];
        const holes = first ? 'text-white/40' : guess ? c.guessHoles : c.holes;
        return (
          <div key={i} className="flex flex-1 items-stretch min-w-0">
            {/* 샷 카드: 필름 한 칸처럼 위아래에 구멍 줄. 도착할 때마다 오른쪽에서 밀려 들어온다 */}
            <div
              style={{ animationDelay: `${i * 60}ms` }}
              className={`shot-in flex flex-1 flex-col gap-[10px] items-center text-center self-stretch px-[16px] py-[10px] rounded-[10px] min-w-0 ${
                guess ? c.guessCard : first ? 'bg-[#f26b1d] shadow-[0_12px_28px_-12px_rgba(242,107,29,0.6)]' : c.card
              }`}
            >
              <div className={`film-holes w-full ${holes}`} />
              <div className="flex items-center gap-[8px]">
                <span
                  className={`font-mono font-bold text-[12px] tracking-[2.5px] ${
                    first ? 'text-white' : guess ? c.guessShot : c.shot
                  }`}
                >
                  SHOT {i + 1}
                </span>
                <span className={`font-mono font-bold text-[11px] ${first ? 'text-white/70' : c.page}`}>
                  {step.slide ? `p.${step.slide}` : guess ? 'AI 추론' : '발표자 설명'}
                </span>
              </div>
              <p className={`font-black text-[19px] tracking-[-0.4px] leading-[26px] break-keep ${first ? 'text-white' : c.title}`}>
                <HighlightWords text={step.text} words={words} color={first ? '#ffe45c' : c.mark} />
              </p>
              {step.detail && (
                <p className={`font-medium text-[14px] leading-[21px] break-keep ${first ? 'text-white/95' : c.detail}`}>
                  <HighlightWords text={step.detail} words={words} color={first ? '#ffe45c' : c.mark} bold />
                </p>
              )}
              {words.length > 0 && (
                <div className="flex flex-wrap justify-center gap-[5px] mt-auto">
                  {words.map((w) => (
                    <span
                      key={w}
                      className={`px-[9px] py-[2px] rounded-full font-bold text-[12px] ${first ? 'bg-white/20 text-white' : c.chip}`}
                    >
                      {w}
                    </span>
                  ))}
                </div>
              )}
              <div className={`film-holes w-full ${holes}`} />
            </div>
            {i < steps.length - 1 && (
              // 칸과 칸 사이 파이프라인. 연결어(입으로 말할 말)와 왜 이어지는지(논리)를 같이 보여준다.
              <div
                style={{ animationDelay: `${i * 60 + 30}ms` }}
                className="shot-in flex flex-col items-center justify-center shrink-0 w-[124px] gap-[4px] px-[8px]"
              >
                {step.link && <span className="font-bold text-[15px] text-[#f26b1d] whitespace-nowrap">{step.link}</span>}
                <div className="flex items-center w-full">
                  <div className="h-[2px] flex-1 bg-[#f26b1d]" />
                  <span className="font-black text-[14px] text-[#f26b1d] leading-none -ml-[2px]">▶</span>
                </div>
                {step.why && (
                  <span className={`font-medium text-[12px] leading-[16px] text-center break-keep ${c.why}`}>{step.why}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 칸 제목과 설명 안의 핵심 단어들에 색을 입힌다. 겹치면 긴 단어가 이긴다.
function HighlightWords({ text, words, color, bold }: { text: string; words: string[]; color: string; bold?: boolean }) {
  const ranges: [number, number][] = [];
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    if (w.length < 2) continue;
    let at = text.indexOf(w);
    while (at >= 0) {
      const end = at + w.length;
      if (!ranges.some(([s, e]) => at < e && end > s)) ranges.push([at, end]);
      at = text.indexOf(w, end);
    }
  }
  if (!ranges.length) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <span key={i} style={{ color, fontWeight: bold ? 800 : undefined }}>
        {text.slice(s, e)}
      </span>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}

// 답의 근거 표시.
//   notes     슬라이드 근거로 답하지 못해 보강 자료(대본, 설명 자료)와 논리 지도로 만든 답
//   inferred  어느 자료에도 답이 없어 AI 가 추론한 답. 발표자가 그대로 읽지 않게 눈에 띄게 표시한다.
function BasisTag({ basis }: { basis?: 'notes' | 'inferred' }) {
  if (basis === 'inferred')
    return (
      <span className="ml-[8px] px-[8px] py-[2px] rounded-full bg-[#f1ecfb] border border-[#7c5cbf] font-bold text-[11px] text-[#5b3fa0] tracking-normal">
        AI 추론, 자료에 없음
      </span>
    );
  if (basis === 'notes')
    return (
      <span className="ml-[8px] px-[8px] py-[2px] rounded-full bg-[#e8f5ec] font-bold text-[11px] text-[#2f7a47] tracking-normal">
        보강 자료로 만든 답
      </span>
    );
  return null;
}
