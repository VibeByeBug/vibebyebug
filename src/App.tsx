import { useState } from 'react';
import { ErrorScreen } from './components/ErrorScreen';
import { Header } from './components/Header';
import { Hud } from './components/Hud';
import { MicControl } from './components/MicControl';
import { PostSessionTabs } from './components/PostSessionTabs';
import { PreparingScreen } from './components/PreparingScreen';
import { RecognizedQuestion } from './components/RecognizedQuestion';
import { StartScreen } from './components/StartScreen';
import { TextInputFallback } from './components/TextInputFallback';
import { UploadScreen } from './components/UploadScreen';
import { useQaSocket } from './hooks/useQaSocket';
import { mockQaResult } from './mocks/qaMock';
import { mockRecognizedQuestion } from './mocks/questionMock';
import type { ScreenName } from './types/flow';

const SCREENS: { key: ScreenName; label: string }[] = [
  { key: 'start', label: '시작' },
  { key: 'upload', label: '업로드' },
  { key: 'preparing', label: '준비 상태' },
  { key: 'mic', label: '마이크' },
  { key: 'recognized', label: '인식된 질문' },
  { key: 'textInput', label: '텍스트 입력' },
  { key: 'hud', label: 'HUD' },
  { key: 'error', label: '오류 안내' },
  { key: 'postSession', label: '사후 화면' },
];

function App() {
  const [screen, setScreen] = useState<ScreenName>('start');
  const [question, setQuestion] = useState(mockRecognizedQuestion);
  const { isConnected, lastResult } = useQaSocket();

  function handlePartialResult(text: string) {
    setQuestion((prev) => ({ ...prev, partialText: text, isConfirmed: false }));
    setScreen('recognized');
  }

  function handleFinalResult(text: string) {
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    setScreen('recognized');
    setTimeout(() => setScreen('hud'), 1200);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />

      <div className="px-4 py-10">
        <div className="mx-auto mb-6 flex w-full max-w-2xl flex-wrap gap-2">
          {SCREENS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScreen(item.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                screen === item.key ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-orange-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {screen === 'start' && <StartScreen onStart={() => setScreen('upload')} />}

        {screen === 'upload' && <UploadScreen onNext={() => setScreen('preparing')} />}

        {screen === 'preparing' && (
          <PreparingScreen onReady={() => setScreen('mic')} onRetry={() => setScreen('upload')} />
        )}

        {screen === 'mic' && (
          <MicControl
            onPartialResult={handlePartialResult}
            onFinalResult={handleFinalResult}
            onSttError={() => setScreen('textInput')}
          />
        )}

        {screen === 'recognized' && (
          <RecognizedQuestion
            partialText={question.partialText}
            finalText={question.finalText}
            isConfirmed={question.isConfirmed}
          />
        )}

        {screen === 'textInput' && (
          <TextInputFallback
            onSubmit={(text) => {
              setQuestion({ partialText: text, finalText: text, isConfirmed: true });
              setScreen('hud');
            }}
          />
        )}

        {screen === 'hud' && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <div className="text-sm text-gray-500">
              WebSocket: {isConnected ? '연결됨' : '연결 대기 중'}
            </div>
            <Hud result={lastResult ?? mockQaResult} />
            <button
              type="button"
              onClick={() => setScreen('postSession')}
              className="self-start rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              질문 로그 저장하고 마치기
            </button>
          </div>
        )}

        {screen === 'error' && (
          <ErrorScreen onEditQuestion={() => setScreen('textInput')} onRetry={() => setScreen('mic')} />
        )}

        {screen === 'postSession' && <PostSessionTabs />}
      </div>
    </div>
  );
}

export default App;
