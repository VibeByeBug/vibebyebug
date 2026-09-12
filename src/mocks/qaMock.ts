import type { QaResult } from '../types/qa';

export const mockQaResult: QaResult = {
  snippet: '발표 자료 3페이지 매출 성장률 근거를 묻는 질문에 대한 핵심 답변입니다.',
  keywords: ['지연시간', '매출성장', '고객유입', 'WebSocket', '실시간처리', 'RAG'],
  sources: [
    { slide: 3, quote: '2024년 대비 매출 22% 성장' },
    { slide: 7, quote: '신규 고객 유입 채널 3곳 확대' },
    { slide: 9, quote: '고객 만족도 4.6/5.0 달성' },
  ],
};
