import { useState } from 'react';
import { Header } from './components/Header';
import { Hud } from './components/Hud';
import { Login } from './components/Login';
import { MicConnectScreen } from './components/MicConnectScreen';
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
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { mockQaResult } from './mocks/qaMock';
import { mockRecognizedQuestion } from './mocks/questionMock';
import { DownloadIcon } from './components/icons';
import type { ScreenName } from './types/flow';

function App() {
  const [screen, setScreen] = useState<ScreenName>('login');
  const [presentationName, setPresentationName] = useState('캡스톤 디자인 최종 발표');
  const [question, setQuestion] = useState(mockRecognizedQuestion);
  const [uploadAttempted, setUploadAttempted] = useState(false);
  const [mockProgress, setMockProgress] = useState({ index: 0, total: 7 });
  const { lastResult } = useQaSocket();

  const result = lastResult ?? mockQaResult;

  function handlePartialResult(text: string) {
    setQuestion((prev) => ({ ...prev, partialText: text, isConfirmed: false }));
    setScreen('recognized');
  }

  function handleFinalResult(text: string) {
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    setScreen('recognized');
    setTimeout(() => setScreen('hud'), 1200);
  }

  const { start: startRecognition } = useSpeechRecognition({
    onPartialResult: handlePartialResult,
    onFinalResult: handleFinalResult,
    onError: () => setScreen('textInput'),
  });

  function handleConnectMic() {
    setQuestion({ partialText: '', finalText: '', isConfirmed: false });
    setScreen('recognized');
    startRecognition();
  }

  function handleUploadFail() {
    setUploadAttempted(true);
    setScreen('uploadFailed');
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-white">
      {screen === 'login' && <Login onLogin={() => setScreen('start')} />}

      {screen === 'start' && (
        <>
          <Header onNavigate={setScreen} />
          <StartScreen
            onStart={(title) => {
              setPresentationName(title);
              setUploadAttempted(false);
              setScreen('upload');
            }}
            onOpenReport={() => setScreen('report')}
          />
        </>
      )}

      {screen === 'upload' && (
        <>
          <Header onNavigate={setScreen} label={presentationName} rightText="2 / 3 준비" />
          <UploadScreen
            forceFail={!uploadAttempted}
            onUploadFail={handleUploadFail}
            onSkip={() => setScreen('preparing')}
            onStartMock={() => setScreen('mockPractice')}
          />
        </>
      )}

      {screen === 'uploadFailed' && (
        <>
          <Header onNavigate={setScreen} label={presentationName} rightText="2 / 3 준비" />
          <UploadFailedScreen onBackToList={() => setScreen('start')} onRetry={() => setScreen('upload')} />
        </>
      )}

      {screen === 'preparing' && (
        <>
          <Header onNavigate={setScreen} label={presentationName} showProfile />
          <PreparingScreen onReady={() => setScreen('micConnect')} onRetry={() => setScreen('upload')} />
        </>
      )}

      {screen === 'mockPractice' && (
        <>
          <Header
            onNavigate={setScreen}
            label="모의 연습"
            rightText={`${mockProgress.index + 1} / ${mockProgress.total} 문항`}
          />
          <MockPracticeScreen
            onFinish={() => setScreen('micConnect')}
            onIndexChange={(index, total) => setMockProgress({ index, total })}
          />
        </>
      )}

      {screen === 'micConnect' && (
        <>
          <Header onNavigate={setScreen} compact rightText="대기 중" />
          <MicConnectScreen onConnect={handleConnectMic} />
        </>
      )}

      {screen === 'recognized' && (
        <>
          <Header onNavigate={setScreen} compact listening rightText="분석 준비 중" showProfile={false} />
          <RecognizedQuestion
            partialText={question.partialText}
            finalText={question.finalText}
            isConfirmed={question.isConfirmed}
          />
        </>
      )}

      {screen === 'textInput' && (
        <>
          <Header onNavigate={setScreen} compact rightText="음성 인식 대체" showProfile={false} />
          <TextInputFallback
            onSubmit={(text) => {
              setQuestion({ partialText: text, finalText: text, isConfirmed: true });
              setScreen('hud');
            }}
          />
        </>
      )}

      {screen === 'hud' && (
        <>
          <Header
            onNavigate={setScreen}
            compact
            listening
            rightText={`응답 ${result.responseMs}ms`}
            showProfile={false}
          />
          <Hud result={result} question={question.finalText || mockRecognizedQuestion.finalText} />
        </>
      )}

      {screen === 'report' && (
        <>
          <Header
            onNavigate={setScreen}
            label="사후 리포트"
            showProfile={false}
            rightButtons={
              <div className="flex gap-[10px]">
                <button
                  type="button"
                  className="border border-[#e5e7eb] flex gap-[7px] h-[40px] items-center px-[14px] rounded-[6px]"
                >
                  <span className="size-[16px] text-[#1a1a1a]">
                    <DownloadIcon />
                  </span>
                  <span className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">PDF 저장</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('start')}
                  className="bg-[#f26b1d] flex h-[40px] items-center px-[16px] rounded-[6px]"
                >
                  <span className="font-bold text-[14px] text-white whitespace-nowrap">다음 발표 준비</span>
                </button>
              </div>
            }
          />
          <Report presentationName={presentationName} />
        </>
      )}

      {screen === 'myHistory' && (
        <>
          <Header onNavigate={setScreen} label="내 기록" activeMenu="history" />
          <MyHistoryScreen onOpenReport={() => setScreen('report')} />
        </>
      )}

      {screen === 'settings' && (
        <>
          <Header onNavigate={setScreen} label="설정" activeMenu="settings" />
          <SettingsScreen />
        </>
      )}
    </div>
  );
}

export default App;
