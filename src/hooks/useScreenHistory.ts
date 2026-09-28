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
  doc: string; // 이 칸을 만든 페이지 (새로고침마다 다르다)
  screen: ScreenName;
  idx: number;
  session: number | null;
}

// 이번에 열린 페이지. 새로고침하면 그 전 페이지가 쌓은 칸들도 기록에 남는데, 그 칸들의 번호는 지금 칸들과
// 맞지 않고 그때의 발표 상태도 사라졌다. 그런 칸은 이 값으로 가려서 건너뛰기 계산에 넣지 않는다.
const DOC = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// 브라우저의 뒤로 가기, 앞으로 가기로 앱 안의 화면을 오간다.
// 화면이 바뀔 때마다 history 에 한 칸 쌓고(pushState), 뒤로 가기(popstate)가 오면 그 칸의 화면을 띄운다.
// 전에는 화면을 상태로만 바꿔서 브라우저 기록에 칸이 하나뿐이었고, 뒤로 가기를 누르면 사이트를 나가버렸다.
// 주소(URL)는 바꾸지 않는다. 발표 상태가 메모리에만 있어서 새로고침하면 어차피 처음 화면부터다.
export function useScreenHistory({ screen, setScreen, shouldReplace, getSession, resolve }: UseScreenHistoryOptions) {
  const idx = useRef(0); // 지금 칸의 번호. 새로고침 전 페이지의 칸에 가 있으면 -1
  const stack = useRef<ScreenName[]>([screen]); // 칸 번호별 화면 (history 는 지난 칸을 읽을 수 없어서 따로 둔다)
  const shown = useRef(screen); // 기록과 맞춰 둔 마지막 화면
  const popping = useRef(false); // 뒤로 가기로 바뀐 화면은 다시 쌓지 않는다
  const replaceNext = useRef(false); // 다음 화면 이동은 새 칸 대신 지금 칸을 바꾼다 (back() 참고)
  const landing = useRef<ScreenName | null>(null); // leave() 로 돌아간 칸에 대신 띄울 화면
  const chainFrom = useRef<number | null>(null); // 칸을 건너뛰기 시작한 칸 (앞으로 가기 끝에 닿으면 여기로 돌아온다)
  const returning = useRef(false); // 이번 popstate 는 chainFrom 으로 되돌아온 것
  const opts = useRef({ shouldReplace, getSession, resolve });
  // 아래 effect 들보다 먼저 선언해야 그 effect 들이 이번 렌더의 함수를 읽는다
  useEffect(() => {
    opts.current = { shouldReplace, getSession, resolve };
  });

  useEffect(() => {
    const entry = (s: ScreenName, i: number): HistoryState => ({
      readyQ: true,
      doc: DOC,
      screen: s,
      idx: i,
      session: opts.current.getSession(),
    });
    history.replaceState(entry(shown.current, 0), '');

    function show(want: ScreenName) {
      // 같은 화면이면 상태가 안 바뀌어 아래 effect 가 돌지 않으므로 표시를 세우지 않는다
      if (want !== shown.current) {
        popping.current = true;
        setScreen(want);
      }
    }

    const onPop = (e: PopStateEvent) => {
      const st = e.state as HistoryState | null;
      if (!st?.readyQ) return; // 이 앱이 만든 칸이 아니다
      if (st.doc !== DOC) {
        // 새로고침 전 페이지의 칸. 번호가 지금 칸들과 맞지 않아 건너뛰지 않고, 띄울 수 있는 화면만 띄운다.
        idx.current = -1;
        chainFrom.current = null;
        returning.current = false;
        landing.current = null;
        show(opts.current.resolve(st.screen, null));
        return;
      }
      const entering = idx.current < 0; // 새로고침 전 칸에서 돌아왔다. 어느 쪽으로 왔는지 몰라 건너뛰지 않는다.
      const dir = st.idx < idx.current ? -1 : 1; // 사용자가 가던 방향
      const from = chainFrom.current ?? idx.current;
      idx.current = st.idx;
      if (returning.current) {
        // 건너뛰다 기록 끝에 닿아 처음 칸으로 되돌아왔다. 화면은 그대로다.
        returning.current = false;
        chainFrom.current = null;
        return;
      }
      let want: ScreenName;
      if (landing.current) {
        want = landing.current;
        landing.current = null;
      } else {
        want = opts.current.resolve(st.screen, st.session ?? null);
        // 지금 띄울 수 없는 칸(끝난 발표의 화면 등)이나 지금과 같은 화면인 칸은 가던 방향으로 한 칸 더 간다.
        // 안 그러면 그런 칸마다 뒤로 가기를 눌러도 화면이 그대로여서 고장 난 것처럼 보인다.
        if (!entering && (want !== st.screen || want === shown.current)) {
          const next = st.idx + dir;
          if (next >= 0 && next < stack.current.length) {
            chainFrom.current = from;
            history.go(dir);
            return;
          }
          chainFrom.current = null;
          if (dir < 0 && want === shown.current) {
            // 이 페이지의 첫 칸까지 왔는데 화면이 그대로다. 한 번 더 가서 사이트를 나간다 (두 번 누르지 않게).
            history.go(-1);
            return;
          }
          if (dir > 0 && from >= 0 && from !== st.idx) {
            // 앞으로 가기 끝까지 띄울 칸이 없다. 그 칸을 살려 두지 않고 처음 칸으로 돌아간다.
            returning.current = true;
            history.go(from - st.idx);
            return;
          }
        }
      }
      chainFrom.current = null;
      if (want !== st.screen) history.replaceState({ ...st, screen: want }, '');
      stack.current[st.idx] = want;
      show(want);
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
    chainFrom.current = null; // 건너뛰던 중이었어도 사용자가 다른 화면으로 갔으면 끝난 것
    const next: HistoryState = {
      readyQ: true,
      doc: DOC,
      screen,
      idx: idx.current,
      session: opts.current.getSession(),
    };
    // 새로고침 전 칸(idx -1)에 있을 때는 바꿔치기하지 않고 새로 쌓는다. 여기서부터 이 페이지의 기록이 다시 시작된다.
    if (idx.current >= 0 && (replaceNext.current || opts.current.shouldReplace(from, screen))) {
      stack.current[idx.current] = screen;
      history.replaceState(next, '');
    } else {
      idx.current += 1;
      next.idx = idx.current;
      stack.current = stack.current.slice(0, idx.current); // 앞으로 가기 칸은 버린다 (브라우저와 같게)
      stack.current[idx.current] = screen;
      history.pushState(next, '');
    }
    replaceNext.current = false;
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
  // 그 칸에 target 을 띄운다. 떠난 화면들이 뒤로 가기 기록에 남지 않는다.
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
