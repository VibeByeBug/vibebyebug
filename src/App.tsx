import { useState } from 'react';
import { ErrorScreen } from './components/ErrorScreen';
import { Header } from './components/Header';
import { Hud } from './components/Hud';
import { Login } from './components/Login';
import { MicConnectScreen } from './components/MicConnectScreen';
import { MicControl } from './components/MicControl';
import { MockPracticeScreen } from './components/MockPracticeScreen';
import { MyHistoryScreen } from './components/MyHistoryScreen';
import { PreparingScreen } from './components/PreparingScreen';
import { RecognizedQuestion } from './components/RecognizedQuestion';
import { Report } from './components/Report';
import { SettingsScreen } from './components/SettingsScreen';
import { StartScreen } from './components/StartScreen';
import { TextInputFallback } from './components/TextInputFallback';
import { UploadFailedScreen } from './components/UploadFailedScreen';
import { UploadScreen } from './components/UploadScreen';
import { useQaSocket } from './hooks/useQaSocket';
import { mockQaResult, mockQaResultNoSources } from './mocks/qaMock';
import { mockRecognizedQuestion } from './mocks/questionMock';
import type { ScreenName } from './types/flow';

const SCREENS: { key: ScreenName; label: string }[] = [
  { key: 'login', label: '1.로그인' },
  { key: 'start', label: '2.시작' },
  { key: 'upload', label: '3.업로드' },
  { key: 'uploadFailed', label: '4.업로드 실패' },
  { key: 'preparing', label: '5.AI 준비 중' },
  { key: 'mockPractice', label: '6.모의 연습' },
  { key: 'micConnect', label: '7.마이크 연결' },
  { key: 'mic', label: '8.마이크 대기/제어' },
  { key: 'recognized', label: '9.질문 인식 중' },
  { key: 'textInput', label: '텍스트 입력 대체' },
  { key: 'hud', label: '10.실전 Q&A' },
  { key: 'error', label: '오류 안내' },
  { key: 'report', label: '15.사후 리포트' },
  { key: 'myHistory', label: '16.내 기록' },
  { key: 'settings', label: '17.설정' },
];

function App() {
  const [screen, setScreen] = useState<ScreenName>('login');
  const [presentationName, setPresentationName] = useState('2026 상반기 서비스 기획 발표');
  const [question, setQuestion] = useState(mockRecognizedQuestion);
  const [hudShowEmpty, setHudShowEmpty] = useState(false);
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

  const headerProps = (() => {
    switch (screen) {
      case 'start':
        return { showProfile: true };
      case 'upload':
        return { presentationName, statusText: '2 / 3 준비' };
      case 'uploadFailed':
        return { presentationName, statusText: '2 / 3 준비' };
      case 'preparing':
        return { presentationName, showProfile: false };
      case 'mockPractice':
        return { presentationName, statusText: '모의 연습' };
      case 'micConnect':
        return { presentationName, statusText: '곧 시작돼요' };
      case 'mic':
      case 'recognized':
      case 'textInput':
      case 'error':
        return { presentationName };
      case 'hud':
        return { presentationName, statusText: '실시간 Q&A' };
      case 'report':
        return { presentationName };
      case 'myHistory':
        return { activeMenu: 'history' as const };
      case 'settings':
        return { activeMenu: 'settings' as const };
      default:
        return {};
    }
  })();

  return (
    <div className="min-h-screen bg-gray-100">
      {screen !== 'login' && <Header onNavigate={setScreen} {...headerProps} />}

      <div className={screen === 'login' ? '' : 'px-4 py-10'}>
        <div className="mx-auto mb-6 flex w-full max-w-4xl flex-wrap gap-2 px-4">
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

        {screen === 'login' && <Login onLogin={() => setScreen('start')} />}

        {screen === 'start' && (
          <StartScreen
            onStart={(title) => {
              setPresentationName(title);
              setScreen('upload');
            }}
            onOpenReport={() => setScreen('report')}
          />
        )}

        {screen === 'upload' && (
          <UploadScreen onSkip={() => setScreen('preparing')} onStartMock={() => setScreen('mockPractice')} />
        )}

        {screen === 'uploadFailed' && (
          <UploadFailedScreen onBackToList={() => setScreen('start')} onRetry={() => setScreen('upload')} />
        )}

        {screen === 'preparing' && (
          <PreparingScreen onReady={() => setScreen('micConnect')} onRetry={() => setScreen('upload')} />
        )}

        {screen === 'mockPractice' && <MockPracticeScreen onFinish={() => setScreen('micConnect')} />}

        {screen === 'micConnect' && <MicConnectScreen onConnect={() => setScreen('mic')} />}

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
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>WebSocket: {isConnected ? '연결됨' : '연결 대기 중'}</span>
              <button
                type="button"
                onClick={() => setHudShowEmpty((v) => !v)}
                className="text-xs font-medium text-gray-400 underline hover:text-gray-600"
              >
                {hudShowEmpty ? '근거 있음 보기' : '근거 없음 상태 보기'}
              </button>
            </div>
            <Hud result={lastResult ?? (hudShowEmpty ? mockQaResultNoSources : mockQaResult)} />
            <button
              type="button"
              onClick={() => setScreen('report')}
              className="self-start rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              발표 종료하고 리포트 보기
            </button>
          </div>
        )}

        {screen === 'error' && (
          <ErrorScreen onEditQuestion={() => setScreen('textInput')} onRetry={() => setScreen('mic')} />
        )}

        {screen === 'report' && (
          <Report presentationName={presentationName} onNextPresentation={() => setScreen('start')} />
        )}

        {screen === 'myHistory' && <MyHistoryScreen onOpenReport={() => setScreen('report')} />}

        {screen === 'settings' && <SettingsScreen />}
      </div>
    </div>
  );
}

export default App;
