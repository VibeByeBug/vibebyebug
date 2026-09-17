export type QuestionType = '사실확인' | '절차' | '근거' | '한계/반론';

export interface MockQuestion {
  id: number;
  type: QuestionType;
  basisPage: number;
  question: string;
}
