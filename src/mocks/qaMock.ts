import type { QaResult } from '../types/qa';

export const mockQaResult: QaResult = {
  type: '사실확인',
  responseMs: 428,
  snippet: '발표 자료 3페이지 매출 성장률 근거를 묻는 질문에 대한 핵심 답변입니다.',
  keywords: ['33,000장', '3,300장', 'YOLOv8', '0.96', '성능 평가', '확신도'],
  sources: [
    { slide: 11, quote: '사진 33,000장으로 AI(YOLOv8)를 학습시키고, 학습에 쓰지 않은 3,300장으로 성능을 평가했다.' },
    { slide: 12, quote: 'AI 탐지: 토사퇴적(DS) 확신도 0.96' },
    { slide: 13, quote: 'AI의 확신도를 ±20% 흔들어도 순위가 유지됐다' },
  ],
};

export const mockQaResultLimitation: QaResult = {
  type: '한계/반론',
  responseMs: 512,
  snippet: '포트홀은 차가 많이 다녀서 생기는 경우도 많지 않나요?',
  keywords: [],
  suggestions: [
    '그 부분은 저희도 한계로 보고 있습니다. 자료에 이렇게 적어뒀습니다.',
    '정확히 답하려면 질문 범위를 조금 좁혀주실 수 있을까요?',
  ],
  sources: [
    { slide: 18, quote: '교통량은 이번 모델에 포함하지 않았으며, 향후 과제로 남겼다.' },
    { slide: 19, quote: '포트홀 발생 원인은 노면 균열, 강수량 두 변수만 사용했다.' },
    { slide: 13, quote: '확신도를 ±20% 흔들어도 우선순위가 유지됐다' },
  ],
};

export const mockQaResultNoSources: QaResult = {
  type: '사실확인',
  responseMs: 301,
  snippet: '점심은 뭐 드셨어요?',
  keywords: [],
  sources: [],
  suggestions: [
    '그 부분은 이번 분석 범위에 넣지 않았습니다.',
    '질문 의도를 조금만 더 구체적으로 말씀해주시겠어요?',
    '확인해서 따로 답변 드리겠습니다.',
  ],
};
