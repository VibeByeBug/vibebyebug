export interface QaSource {
  slide: number; // 슬라이드 번호
  quote: string; // 인용문 원문
}

export interface QaResult {
  snippet: string; // 핵심 요약, 최대 120자
  keywords: string[]; // 최대 6개
  sources: QaSource[]; // 기본 3개, 최대 5개까지 확장 가능
}
