import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechRecognitionOptions {
  onPartialResult: (text: string) => void;
  onFinalResult: (text: string) => void;
  onError: () => void;
}

// 이 오류가 나면 계속 들을 수 없다 (권한 거부, 마이크 없음 등). 나머지는 잠깐 조용했던 것뿐이라 다시 듣는다.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);

export function useSpeechRecognition({ onPartialResult, onFinalResult, onError }: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // 발표자가 직접 껐는가. 브라우저는 조용하면 알아서 인식을 끝내므로, 직접 끈 게 아니면 다시 켠다.
  const stoppedByUserRef = useRef(true);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.error('[useSpeechRecognition] SpeechRecognition API is not supported in this browser');
      onError();
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        onFinalResult(final.trim());
      } else if (interim) {
        onPartialResult(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      console.error('[useSpeechRecognition] speech recognition error:', event.error);
      if (FATAL_ERRORS.has(event.error)) {
        stoppedByUserRef.current = true;
        setListening(false);
        onError();
      }
    };

    recognition.onend = () => {
      if (!stoppedByUserRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start(); // 조용해서 끝난 것. 다시 듣는다.
          return;
        } catch {
          // 이미 시작 중이면 무시
        }
      }
      setListening(false);
    };

    stoppedByUserRef.current = false;
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onPartialResult, onFinalResult, onError]);

  const stop = useCallback(() => {
    stoppedByUserRef.current = true;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { start, stop, listening };
}
