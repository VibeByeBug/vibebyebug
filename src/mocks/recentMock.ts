export interface RecentPresentation {
  id: string;
  name: string;
  date: string;
}

export const mockRecentPresentations: RecentPresentation[] = [
  { id: 'p1', name: '2026 상반기 서비스 기획 발표', date: '2026.09.10' },
  { id: 'p2', name: '졸업 프로젝트 중간발표', date: '2026.08.28' },
  { id: 'p3', name: '인턴십 최종 발표', date: '2026.08.02' },
];
