import type { QuestionLogEntry, RetrospectiveStat } from '../types/postSession';

export const mockRetrospectiveStats: RetrospectiveStat[] = [
  { label: '총 질문 수', value: '5개' },
  { label: '평균 응답 시간', value: '3.2초' },
  { label: '근거 매칭률', value: '80%' },
];

export const mockQuestionLog: QuestionLogEntry[] = [
  {
    id: '1',
    question: '재무 지표에서 매출 성장률의 근거는 무엇인가요?',
    answerSnippet: '발표 자료 3페이지 매출 성장률 근거를 묻는 질문에 대한 핵심 답변입니다.',
    askedAt: '14:02',
  },
  {
    id: '2',
    question: '신규 고객 유입 채널은 어떻게 확대했나요?',
    answerSnippet: '신규 고객 유입 채널 3곳을 확대하여 매출 성장에 기여했습니다.',
    askedAt: '14:07',
  },
  {
    id: '3',
    question: '고객 만족도는 어떻게 측정했나요?',
    answerSnippet: '설문 기반으로 고객 만족도 4.6/5.0을 달성했습니다.',
    askedAt: '14:11',
  },
];
