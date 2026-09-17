import type { MockQuestion } from '../types/mockPractice';

export const mockPracticeQuestions: MockQuestion[] = [
  { id: 1, type: '사실확인', basisPage: 3, question: '이 서비스의 목표 사용자 수는 몇 명으로 산정하셨나요?' },
  { id: 2, type: '절차', basisPage: 5, question: 'MVP 개발부터 출시까지의 일정은 어떻게 되나요?' },
  { id: 3, type: '근거', basisPage: 7, question: '경쟁사 대비 차별점을 뒷받침하는 데이터가 있나요?' },
  { id: 4, type: '한계/반론', basisPage: 9, question: '제안하신 방식이 실패할 경우 대안은 무엇인가요?' },
  { id: 5, type: '사실확인', basisPage: 11, question: '예산 산정 기준이 되는 항목은 무엇인가요?' },
  { id: 6, type: '절차', basisPage: 13, question: '의사결정 프로세스는 누가 주도하나요?' },
  { id: 7, type: '근거', basisPage: 15, question: '사용자 인터뷰는 몇 명을 대상으로 진행했나요?' },
];
