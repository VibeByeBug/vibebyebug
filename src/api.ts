import type { QuestionType } from './types/mockPractice';
import type { AnswerMode, CoreCard, FlowStep, QaResult } from './types/qa';

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
  // 서버가 안 떠 있으면 fetch 가 "Failed to fetch" 를 던진다. 그대로 보여주면 원인을 알 수 없다.
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/upload/pdf`, { method: 'POST', body });
  } catch {
    throw new Error(`서버에 연결하지 못했습니다. 백엔드(${API_URL})가 켜져 있는지 확인해주세요.`);
  }
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
  core?: CoreCard | null;
  core_pending?: string;
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
    core: m.core ?? null,
    corePending: m.core_pending || '',
  };
}

// 기본 질문 답 (연습에서 추천, 발표자가 확정)
export interface CoreItem {
  id: string;
  label: string;
  suggested: FlowStep[];
  status: 'ok' | 'no_answer' | 'error';
  approved: CoreCard | null;
}

export async function fetchCoreSuggest(presentationId: string): Promise<CoreItem[]> {
  const res = await fetch(`${API_URL}/api/core/${presentationId}/suggest`);
  if (!res.ok) throw new Error(`추천을 불러오지 못했습니다 (${res.status})`);
  return (await res.json()).items;
}

export async function approveCore(presentationId: string, id: string, steps: FlowStep[], edited: boolean) {
  const res = await fetch(`${API_URL}/api/core/${presentationId}/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps, edited }),
  });
  if (!res.ok) throw new Error('확정하지 못했습니다');
  return (await res.json()).card as CoreCard;
}

export interface AnswerWarning {
  slide: number | null;
  message: string;
}

export type SaveAnswerResult =
  | { status: 'saved'; card: CoreCard }
  | { status: 'needs_review'; warnings: AnswerWarning[] };

// 연습에서 한 답을 저장한다. 슬라이드와 맞지 않는 곳이 있으면 저장하지 않고 경고를 돌려준다.
export async function saveCoreAnswer(
  presentationId: string,
  id: string,
  answer: string,
  confirmed = false,
): Promise<SaveAnswerResult> {
  const res = await fetch(`${API_URL}/api/core/${presentationId}/${id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, confirmed }),
  });
  if (!res.ok) throw new Error('답을 저장하지 못했습니다');
  return res.json();
}

export async function discardCore(presentationId: string, id: string) {
  await fetch(`${API_URL}/api/core/${presentationId}/${id}`, { method: 'DELETE' });
}

export type { AnswerMode };

// 서버에 남아 있는 발표 목록 (/api/upload/list). 시작 화면의 "최근 촬영분" 에서 이어서 열 때 쓴다.
export interface SavedPresentation {
  presentation_id: string;
  title: string;
  uploaded_at: string; // ISO
  size_mb: number;
  ready: boolean; // 지금 서버 메모리에 올라와 있나 (아니면 다시 준비한다)
}

export async function listPresentations(): Promise<SavedPresentation[]> {
  const res = await fetch(`${API_URL}/api/upload/list`);
  if (!res.ok) throw new Error(`목록을 불러오지 못했습니다 (${res.status})`);
  const data = await res.json();
  return (data.files ?? []) as SavedPresentation[];
}

// Q&A 기록 (/api/logs). 실전에서 받은 질문마다 ReadyQ 가 직접 남긴다.
export interface QaLogRow {
  at: string;
  question: string;
  qtype?: string;
  status: 'ok' | 'no_evidence' | 'ignored' | string;
  latency_ms?: number;
  slides?: number[];
  keywords?: string[];
}

export interface QaSession {
  presentation_id: string;
  total: number;
  answered: number;
  no_evidence: number;
  ignored: number;
  avg_latency_ms: number | null;
  last_at: string;
}

export async function listQaSessions(): Promise<QaSession[]> {
  const res = await fetch(`${API_URL}/api/logs`);
  if (!res.ok) throw new Error(`기록을 불러오지 못했습니다 (${res.status})`);
  return ((await res.json()).sessions ?? []) as QaSession[];
}

export async function getQaLogs(presentationId: string): Promise<QaLogRow[]> {
  const res = await fetch(`${API_URL}/api/logs/${presentationId}`);
  if (!res.ok) throw new Error(`기록을 불러오지 못했습니다 (${res.status})`);
  return ((await res.json()).logs ?? []) as QaLogRow[];
}
