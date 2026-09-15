export interface RetrospectiveStat {
  label: string;
  value: string;
}

export interface QuestionLogEntry {
  id: string;
  question: string;
  answerSnippet: string;
  askedAt: string;
}
