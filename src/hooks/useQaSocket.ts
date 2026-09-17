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
        // 잡음(헛기침 등)으로 판정되면 화면을 바꾸지 않는다
        if (msg.status === 'ignored') return;
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
    };

    socket.onerror = (event) => {
      console.error('[useQaSocket] error:', event);
    };

    return () => {
      socket.close();
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
