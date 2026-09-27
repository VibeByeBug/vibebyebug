import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      // 라이트/다크 공통 팔레트. 무대(다크)는 stage/slateInk, 라이트는 paper/chalk 를 배경으로 쓴다.
      // 포인트 색(cueOrange/tallyRed/spotAmber)은 두 모드에서 그대로 쓴다.
      colors: {
        stage: '#15110d',
        slateInk: '#111111',
        paper: '#f6efe7',
        chalk: '#f8f8f8',
        cueOrange: '#dc4a1e',
        tallyRed: '#e53220',
        spotAmber: '#ffb547',
        // 모드에 따라 바뀌는 색 (index.css 에서 값을 정한다)
        // page: 바탕 (다크 Stage / 라이트 Paper), ink: 바탕 위 글자와 선 (다크 Chalk / 라이트 Slate Ink)
        page: 'var(--page)',
        ink: 'var(--ink)',
        card: 'var(--card)', // 바탕 위 카드 (다크 #1e1914 / 라이트 흰색)
        cardHover: 'var(--card-hover)',
        well: 'var(--well)', // 카드보다 깊은 패널 (녹음 칸, 슬라이드 목록)
        sel: 'var(--sel)', // 선택된 탭/칸 바탕 (다크 크림 / 라이트 잉크, 서로 반전)
        selInk: 'var(--sel-ink)', // 선택된 탭/칸 글자
        ok: 'var(--ok)', // 저장됨
        err: 'var(--err)', // 오류, 듣는 중
        warn: 'var(--warn)', // 슬라이드에 없는 새 사실
      },
    },
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
