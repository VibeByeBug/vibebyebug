export interface MissedSource {
  page: number;
  content: string;
  missedCount: number;
  totalCount: number;
}

export const missedSources: MissedSource[] = [
  { page: 11, content: '33,000장', missedCount: 3, totalCount: 3 },
  { page: 9, content: '1,584건, 41%', missedCount: 3, totalCount: 4 },
  { page: 18, content: '교통량 변수 제외', missedCount: 1, totalCount: 2 },
];

export const typeDistribution = [
  { type: '사실확인', count: 5, ratio: 1 },
  { type: '근거', count: 3, ratio: 0.6 },
  { type: '한계반론', count: 2, ratio: 0.4 },
  { type: '절차', count: 2, ratio: 0.4 },
];
