import { useEffect, useState, type ReactNode } from 'react';
import { readStoredTheme, THEME_STORAGE_KEY, ThemeContext, type Theme } from './theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  // body 에 theme-dark 를 붙였다 뗐다 한다. index.css 의 ".theme-dark ..." 규칙들이
  // body 의 자손이면 다 걸리므로, 화면 컴포넌트를 손대지 않고도 대부분 화면이 같이 바뀐다.
  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // 저장 안 돼도 이번 세션 동안은 그대로 쓰면 된다
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
