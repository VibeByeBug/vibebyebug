import { useCallback, useEffect, useRef } from 'react';
import type { ScreenName } from '../types/flow';

interface UseScreenHistoryOptions {
  screen: ScreenName;
  setScreen: (s: ScreenName) => void;
  // 기록에 새 칸을 쌓지 않고 지금 칸을 바꿔치기할 이동.
  // 저절로 넘어가는 화면(준비 중 -> 마이크 연결)을 쌓으면 뒤로 가기가 그 화면에 갇힌다
  // (돌아가자마자 다시 저절로 넘어온다).
  shouldReplace: (from: ScreenName, to: ScreenName) => boolean;
  // 지금 발표의 번호 (발표마다 새 번호, 발표 중이 아니면 null). 칸마다 적어 두고 resolve 에 넘긴다.
  getSession: () => number | null;
  // 뒤로/앞으로 가기로 돌아온 칸을 지금 띄울 수 없으면 대신 띄울 화면 (예: 끝난 발표의 화면).
  // 받은 화면을 그대로 돌려주면 그 칸을 띄운다.
  resolve: (s: ScreenName, session: number | null) => ScreenName;
}

interface HistoryState {
  readyQ: true;
  screen: ScreenName;
  idx: number;
  session: number | null;
}

// 브라우저의 뒤로 가기, 앞으로 가기로 앱 안의 화면을 오간다.
// 화면이 바뀔 때마다 history 에 한 칸 쌓고(pushState), 뒤로 가기(popstate)가 오면 그 칸의 화면을 띄운다.
// 전에는 화면을 상태로만 바꿔서 브라우저 기록에 칸이 하나뿐이었고, 뒤로 가기를 누르면 사이트를 나가버렸다.
// 주소(URL)는 바꾸지 않는다. 발표 상태가 메모리에만 있어서 새로고침하면 어차피 처음 화면부터다.
export function useScreenHistory({ screen, setScreen, shouldReplace, getSession, resolve }: UseScreenHistoryOptions) {
  const idx = useRef(0); // 지금 칸의 번호
  const stack = useRef<ScreenName[]>([screen]); // 칸 번호별 화면 (history 는 지난 칸을 읽을 수 없어서 따로 둔다)
  const shown = useRef(screen); // 기록과 맞춰 둔 마지막 화면
  const popping = useRef(false); // 뒤로 가기로 바뀐 화면은 다시 쌓지 않는다
  const replaceNext = useRef(false); // 다음 화면 이동은 새 칸 대신 지금 칸을 바꾼다 (back() 참고)
  const landing = useRef<ScreenName | null>(null); // leave() 로 돌아간 칸에 대신 띄울 화면
  const opts = useRef({ shouldReplace, getSession, resolve });
  // 아래 effect 들보다 먼저 선언해야 그 effect 들이 이번 렌더의 함수를 읽는다
  useEffect(() => {
    opts.current = { shouldReplace, getSession, resolve };
  });

  useEffect(() => {
    const first: HistoryState = { readyQ: true, screen: shown.current, idx: 0, session: opts.current.getSession() };
    history.replaceState(first, '');
    const onPop = (e: PopStateEvent) => {
      const st = e.state as HistoryState | null;
      if (!st?.readyQ) return; // 이 앱이 만든 칸이 아니다
      const dir = st.idx < idx.current ? -1 : 1; // 사용자가 가던 방향
      idx.current = st.idx;
      let want: ScreenName;
      if (landing.current) {
        want = landing.current;
        landing.current = null;
      } else {
        want = opts.current.resolve(st.screen, st.session ?? null);
        // 지금 띄울 수 없는 칸(끝난 발표의 화면 등)은 가던 방향으로 한 칸 더 간다.
        // 안 그러면 그런 칸마다 뒤로 가기를 눌러도 화면이 그대로여서 고장 난 것처럼 보인다.
        // 더 갈 칸이 없으면(기록의 끝) 대신 화면을 띄운다.
        const next = st.idx + dir;
        if (want !== st.screen && next >= 0 && next < stack.current.length) {
          history.go(dir);
          return;
        }
      }
      if (want !== st.screen) history.replaceState({ ...st, screen: want }, '');
      stack.current[st.idx] = want;
      // 같은 화면이면 상태가 안 바뀌어 아래 effect 가 돌지 않으므로 표시를 세우지 않는다
      if (want !== shown.current) {
        popping.current = true;
        setScreen(want);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setScreen]);

  useEffect(() => {
    const from = shown.current;
    shown.current = screen;
    if (popping.current) {
      popping.current = false;
      return;
    }
    if (from === screen) return;
    const next: HistoryState = { readyQ: true, screen, idx: idx.current, session: opts.current.getSession() };
    if (replaceNext.current || opts.current.shouldReplace(from, screen)) {
      replaceNext.current = false;
      stack.current[idx.current] = screen;
      history.replaceState(next, '');
    } else {
      idx.current += 1;
      next.idx = idx.current;
      stack.current = stack.current.slice(0, idx.current); // 앞으로 가기 칸은 버린다 (브라우저와 같게)
      stack.current[idx.current] = screen;
      history.pushState(next, '');
    }
  }, [screen]);

  // 앱 안의 "돌아가기" 버튼. 바로 앞 칸이 그 화면이면 브라우저 뒤로 가기와 똑같이 한 칸 돌아간다.
  // 아니면 지금 칸을 그 화면으로 바꾼다. 새 칸을 쌓으면, 돌아간 뒤 브라우저 뒤로 가기를 눌렀을 때
  // 방금 나온 화면으로 다시 들어가 버린다.
  const back = useCallback(
    (target: ScreenName) => {
      if (target === shown.current) return;
      if (idx.current > 0 && stack.current[idx.current - 1] === target) {
        history.back();
      } else {
        replaceNext.current = true;
        setScreen(target);
      }
    },
    [setScreen],
  );

  // 발표를 마쳤을 때처럼 한 묶음의 화면을 통째로 떠날 때. skip 에 해당하는 칸들을 건너뛰어 그 앞 칸으로 돌아가고,
  // 그 칸에 target 을 띄운다. 끝난 발표 화면들이 뒤로 가기 기록에 남지 않는다.
  const leave = useCallback(
    (skip: (s: ScreenName) => boolean, target: ScreenName) => {
      let j = idx.current;
      while (j >= 0 && skip(stack.current[j])) j -= 1;
      if (j < 0 || j === idx.current) {
        setScreen(target);
        return;
      }
      landing.current = target;
      // 돌아가기(popstate)는 비동기라 그사이 끝난 발표 화면이 자료 없이 한 번 그려진다. 화면은 바로 바꾸고,
      // 기록은 popstate 가 오면 그 칸에 맞춘다 (새 칸을 쌓지 않게 popping 을 세운다).
      if (target !== shown.current) {
        popping.current = true;
        setScreen(target);
      }
      history.go(j - idx.current);
    },
    [setScreen],
  );

  return { back, leave };
}
