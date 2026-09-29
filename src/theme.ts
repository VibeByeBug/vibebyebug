import { createContext, useContext } from 'react';

// 라이트/다크 전환. 기본은 지금까지의 검은 무대(dark). 설정 화면에서 라이트로 바꿀 수 있다.
// 값은 localStorage 에 저장해서 다음에 열어도 고른 대로 남는다. (공급자는 ThemeProvider.tsx)
export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'readyq-theme';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark'; // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 기본값
  }
}

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 은 <ThemeProvider> 안에서만 쓸 수 있어요');
  return ctx;
}
