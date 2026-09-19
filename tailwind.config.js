import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    fontFamily: {
      sans: ['"Noto Sans KR"', ...defaultTheme.fontFamily.sans],
      // 슬레이트 컨셉: 큐 번호와 영문 표제는 Bebas Neue, 슬레이트 칸 이름과 시간은 JetBrains Mono
      display: ['"Bebas Neue"', '"Noto Sans KR"', ...defaultTheme.fontFamily.sans],
      mono: ['"JetBrains Mono"', '"Noto Sans KR"', ...defaultTheme.fontFamily.mono],
      // 슬레이트 판: 칸 이름은 인쇄된 느낌의 좁은 글꼴, 적는 내용은 분필 손글씨
      slate: ['Oswald', '"Noto Sans KR"', ...defaultTheme.fontFamily.sans],
      hand: ['"Nanum Pen Script"', 'cursive'],
    },
  },
};
