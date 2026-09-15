import { useEffect, useRef, useState } from 'react';

interface MicControlProps {
  onPartialResult: (text: string) => void;
  onFinalResult: (text: string) => void;
  onSttError: () => void;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="white" strokeWidth={2}>
      <rect x="9" y="2" width="6" height="12" rx="3" fill="white" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

export function MicControl({ onPartialResult, onFinalResult, onSttError }: MicControlProps) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function handleToggle() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.error('[MicControl] SpeechRecognition API is not supported in this browser');
      onSttError();
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
      console.error('[MicControl] speech recognition error:', event.error);
      setIsRecording(false);
      onSttError();
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl bg-white p-8 shadow-lg">
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        마이크 권한: 허용됨
      </div>

      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={isRecording}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-colors hover:bg-red-600"
      >
        {isRecording ? <span className="h-7 w-7 rounded-sm bg-white" /> : <MicIcon />}
      </button>

      {isRecording ? (
        <div className="flex items-center gap-2 text-sm font-medium text-red-600">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          듣는 중...
        </div>
      ) : (
        <p className="text-sm text-gray-500">버튼을 눌러 질문을 시작하세요</p>
      )}
    </div>
  );
}
