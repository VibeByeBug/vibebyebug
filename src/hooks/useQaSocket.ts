import { useCallback, useEffect, useRef, useState } from 'react';
import { toQaResult } from '../api';
import type { AnswerMode, QaAnswer, QaFlow, QaResult } from '../types/qa';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws';

interface UseQaSocketResult {
  isConnected: boolean;
  lastResult: QaResult | null;
  lastAnswer: QaAnswer | null;
  lastFlow: QaFlow | null;
  notice: string | null; // 자료 준비 전 질문 등 서버 안내
  rawMessage: string | null;
  ask: (text: string, presentationId: string, mode: AnswerMode) => void;
  requestMode: (mode: AnswerMode) => void; // 직전 질문을 다른 모드로 다시 받기
}

export function useQaSocket(): UseQaSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastResult, setLastResult] = useState<QaResult | null>(null);
  const [lastAnswer, setLastAnswer] = useState<QaAnswer | null>(null);
  const [lastFlow, setLastFlow] = useState<QaFlow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rawMessage, setRawMessage] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 서버 재시작이나 와이파이 끊김으로 연결이 닫히면 다시 잇는다.
    // 안 그러면 화면은 멀쩡한데 질문을 보내도 "서버와 연결되지 않았습니다" 만 뜬다.
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log(`[useQaSocket] connected: ${WS_URL}`);
        setIsConnected(true);
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.log('[useQaSocket] raw message (not JSON yet):', event.data);
          setRawMessage(event.data);
          return;
        }
        if (msg.type === 'cue.evidence') {
          // 잡음(헛기침 등)으로 판정되면 근거 화면은 그리지 않는다. 다만 질문을 보낸 뒤라 화면이
          // "근거를 찾고 있어요" 에서 멈추므로, 알아듣지 못했다고 알려준다.
          if (msg.status === 'ignored') {
            setNotice('질문으로 알아듣지 못했어요. 다시 말하거나 "글로 질문하기"로 적어주세요.');
            return;
          }
          setLastResult(toQaResult(msg));
          setNotice(null);
        } else if (msg.type === 'cue.answer') {
          setLastAnswer(msg as QaAnswer);
        } else if (msg.type === 'cue.flow') {
          setLastFlow(msg as QaFlow);
        } else if (msg.type === 'not_ready' || msg.type === 'error') {
          setNotice(msg.message ?? '서버 오류가 발생했습니다.');
        }
      };

      socket.onclose = () => {
        console.log('[useQaSocket] disconnected');
        setIsConnected(false);
        if (!stopped) retry = setTimeout(connect, 1000);
      };

      socket.onerror = (event) => {
        console.error('[useQaSocket] error:', event);
      };

    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  const ask = useCallback((text: string, presentationId: string, mode: AnswerMode) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setNotice('서버와 연결되지 않았습니다.');
      return;
    }
    setLastResult(null);
    setLastAnswer(null);
    setLastFlow(null);
    setNotice(null);
    socket.send(JSON.stringify({ type: 'stt.final', text, presentation_id: presentationId, mode }));
  }, []);

  const requestMode = useCallback((mode: AnswerMode) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || mode === 'keywords') return;
    if (mode === 'answer') setLastAnswer(null);
    if (mode === 'flow') setLastFlow(null);
    socket.send(JSON.stringify({ type: 'cue.extra', mode }));
  }, []);

  return { isConnected, lastResult, lastAnswer, lastFlow, notice, rawMessage, ask, requestMode };
}
