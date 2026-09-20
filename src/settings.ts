// 발표자가 고른 설정. 이 브라우저에만 저장한다(계정 서버가 없다).
// 사생활 보호 모드나 저장을 막은 브라우저에서는 읽기와 쓰기가 모두 실패할 수 있어서, 실패하면 기본값으로 간다.

const KEY = 'readyq.sourceCount';
const ALLOWED = [3, 5] as const;
export type SourceCount = (typeof ALLOWED)[number];

export const DEFAULT_SOURCE_COUNT: SourceCount = 3;

// 실전 화면에 한 번에 보여줄 근거 카드 수
export function loadSourceCount(): SourceCount {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (ALLOWED as readonly number[]).includes(n) ? (n as SourceCount) : DEFAULT_SOURCE_COUNT;
  } catch {
    return DEFAULT_SOURCE_COUNT;
  }
}

export function saveSourceCount(n: SourceCount) {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    // 저장이 막혀 있어도 이번 발표 동안은 화면 상태로 유지된다
  }
}
