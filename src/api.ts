import type { QuestionType } from './types/mockPractice';
import type { AnswerMode, QaResult } from './types/qa';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// 서버 업로드 응답 (/api/upload/pdf)
export interface UploadResult {
  presentation_id: string;
  filename: string;
  slides: number;
  sizeMb: number;
  method?: 'text' | 'image' | 'mixed';
  captioned?: number[]; // 이미지로 읽은 슬라이드
  unreadable?: number[]; // 끝내 못 읽은 슬라이드
  unreadable_message?: string;
  api_calls?: number;
}

export async function uploadPdf(file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_URL}/api/upload/pdf`, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    throw new Error(typeof d === 'string' ? d : (d?.message ?? `업로드 실패 (${res.status})`));
  }
  return { ...data, sizeMb: file.size / (1024 * 1024) } as UploadResult;
}

// 서버 준비 상태 (/api/upload/status/{id})
export interface PrepareStatus {
  state: '분석중' | '준비완료' | '실패' | '없음';
  elapsed_sec?: number;
  message?: string;
}

export async function fetchStatus(presentationId: string): Promise<PrepareStatus> {
  const res = await fetch(`${API_URL}/api/upload/status/${presentationId}`);
  return res.json();
}

// 서버 cue.evidence -> 화면 QaResult
// 서버는 질문 유형을 "한계반론" 으로, 근거 문장을 snippet 으로 보낸다.
interface CueEvidence {
  question_type: string;
  keywords: string[];
  sources: { slide: number; snippet: string }[];
  status: 'ok' | 'no_evidence' | 'ignored';
  advice: string[];
  deflect: string[];
  latency_ms: number;
  server_latency_ms?: number;
}

export function toQaResult(m: CueEvidence): QaResult {
  const type = (m.question_type === '한계반론' ? '한계/반론' : m.question_type || '사실확인') as QuestionType;
  const noEvidence = m.status === 'no_evidence';
  return {
    type,
    snippet: '',
    keywords: m.keywords ?? [],
    sources: noEvidence ? [] : (m.sources ?? []).map((s) => ({ slide: s.slide, quote: s.snippet })),
    suggestions: noEvidence ? m.advice : m.deflect,
    responseMs: Math.round(m.server_latency_ms ?? m.latency_ms ?? 0),
    status: m.status,
  };
}

export type { AnswerMode };
