import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    fontFamily: {
      sans: ['"Noto Sans KR"', ...defaultTheme.fontFamily.sans],
      // 슬레이트 컨셉: 큐 번호와 영문 표제는 Bebas Neue, 슬레이트 칸 이름과 시간은 JetBrains Mono
      display: ['"Bebas Neue"', '"Noto Sans KR"', ...defaultTheme.fontFamily.sans],
      mono: ['"JetBrains Mono"', '"Noto Sans KR"', ...defaultTheme.fontFamily.mono],
    },
  },
};
