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
}
