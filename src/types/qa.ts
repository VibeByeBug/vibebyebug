import type { QuestionType } from './mockPractice';

export interface QaSource {
  slide: number; // 슬라이드 번호
  quote: string; // 인용문 원문
}

export interface QaResult {
  type: QuestionType; // 질문 유형 분류
  snippet: string; // 핵심 요약, 최대 120자
  keywords: string[]; // 최대 6개
  sources: QaSource[]; // 기본 3개, 최대 5개까지 확장 가능
  suggestions?: string[]; // 한계반론 유형 또는 근거 없음일 때 보여줄 추천 답변 문장
  responseMs: number; // 서버 응답 시간(ms)
  status?: 'ok' | 'no_evidence' | 'ignored'; // 서버 판정. no_evidence 면 근거 없음 화면
  core?: CoreCard | null; // 연습에서 확정한 기본 질문 답. 있으면 이 카드를 먼저 띄운다
  corePending?: string; // 기본 질문인데 아직 확정한 답이 없으면 그 질문 이름
}

// 흐름도 한 칸
export interface FlowStep {
  text: string;
  slide: number | null;
  detail?: string; // 칸에서 말할 내용을 풀어 쓴 한 문장
  key?: string; // 칸 안에서 글자 색으로 강조할 핵심 단어
  keys?: string[]; // 강조할 핵심 개념어 여러 개 (key 는 그 첫 번째)
  link?: string; // 다음 칸으로 넘어갈 때 말할 연결어 ("그래서", "근거는")
  why?: string; // 다음 칸으로 왜 이어지는지 (논리 전개 설명)
}

// 연습에서 발표자가 확정한 기본 질문 답
export interface CoreCard {
  id: string;
  label: string;
  steps: FlowStep[];
  edited: boolean; // 발표자가 고쳐서 확정했는가
  source?: 'suggested' | 'edited' | 'answer'; // answer = 연습에서 발표자가 한 답
  answer?: string; // 연습에서 한 답 원문
  confirmed_despite_warning?: boolean; // 경고를 보고도 맞다고 확인하고 저장했는가
}

// 키워드만 볼지, 추천 답변까지 볼지 (설정과 실전 화면 상단에서 고른다)
// both: 추천 답변(위)과 흐름도(아래)를 같이 본다. 실전 화면은 이것만 쓴다(키워드만 보는 모드는 없앴다).
// keywords, answer, flow 는 서버와 옛 화면 호환용으로 남긴다.
export type AnswerMode = 'keywords' | 'answer' | 'flow' | 'both';

// 서버 cue.flow. 말할 순서를 짧은 칸으로. 칸이 완성될 때마다 steps 가 늘어난다.
export interface QaFlow {
  steps: FlowStep[];
  guide?: string; // 답변 가이드: 어떤 순서로, 어느 슬라이드를 근거로 말하면 되는지
  // notes: 슬라이드 근거가 없어 보강 자료와 논리 지도로 만든 답
  // inferred: 어느 자료에도 답이 없어 AI 가 추론한 답 (화면에 따로 표시한다)
  basis?: 'notes' | 'inferred';
  done: boolean;
  latency_ms: number;
  status?: 'ok' | 'no_answer' | 'blocked' | 'error' | 'skipped';
}

// 서버 cue.answer. 문장이 끝날 때마다 text 가 늘어나고, 마지막에 done 과 status 가 온다.
export interface QaAnswer {
  text: string;
  done: boolean;
  latency_ms: number;
  status?: 'ok' | 'no_answer' | 'blocked' | 'error' | 'skipped';
  // notes: 슬라이드 근거가 없어 보강 자료와 논리 지도로 만든 답
  // inferred: 어느 자료에도 답이 없어 AI 가 추론한 답 (화면에 따로 표시한다)
  basis?: 'notes' | 'inferred';
}
