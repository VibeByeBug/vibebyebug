import { useEffect, useRef, useState } from 'react';
import type { QaResult } from '../types/qa';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws';

interface UseQaSocketResult {
  isConnected: boolean;
  lastResult: QaResult | null;
  rawMessage: string | null;
}

export function useQaSocket(): UseQaSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastResult, setLastResult] = useState<QaResult | null>(null);
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
      try {
        const parsed = JSON.parse(event.data) as QaResult;
        setLastResult(parsed);
      } catch {
        console.log('[useQaSocket] raw message (not JSON yet):', event.data);
        setRawMessage(event.data);
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

  return { isConnected, lastResult, rawMessage };
}
