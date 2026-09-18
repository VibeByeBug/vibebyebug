import { useCallback, useEffect, useRef } from 'react';

interface UseSpeechRecognitionOptions {
  onPartialResult: (text: string) => void;
  onFinalResult: (text: string) => void;
  onError: () => void;
}

export function useSpeechRecognition({ onPartialResult, onFinalResult, onError }: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
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
      onError();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onPartialResult, onFinalResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { start, stop };
}
