export interface MissedSource {
  page: number;
  content: string;
  count: number;
}

export const missedSources: MissedSource[] = [
  { page: 4, content: '시장 규모 추정 및 TAM/SAM/SOM 분석 결과', count: 5 },
  { page: 8, content: '경쟁사 비교표 및 차별화 포인트', count: 3 },
  { page: 12, content: '예산 및 리소스 산정 근거', count: 2 },
];

export const typeDistribution = [
  { type: '사실확인', value: 40 },
  { type: '절차', value: 20 },
  { type: '근거', value: 25 },
  { type: '한계/반론', value: 15 },
];
