import { useRef, useState } from 'react';
import type { UploadResult } from './api';
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
import { mockRecognizedQuestion } from './mocks/questionMock';
import { DownloadIcon } from './components/icons';
import type { ScreenName } from './types/flow';
import type { AnswerMode } from './types/qa';

function App() {
  const [screen, setScreen] = useState<ScreenName>('login');
  const [presentationName, setPresentationName] = useState('캡스톤 디자인 최종 발표');
  const [question, setQuestion] = useState(mockRecognizedQuestion);
  const [mockProgress, setMockProgress] = useState({ index: 0, total: 7 });
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<{ fileName: string; message: string } | null>(null);
  const [mode, setMode] = useState<AnswerMode>('keywords');
  const [textFromError, setTextFromError] = useState(true); // 음성 인식 실패로 온 입력인지
  const { lastResult, lastAnswer, notice, ask } = useQaSocket();

  // 음성 인식 콜백은 인식을 시작한 순간의 값을 붙잡고 있어서, 최신 발표와 모드는 ref 로 읽는다
  const uploadRef = useRef(upload);
  const modeRef = useRef(mode);
  uploadRef.current = upload;
  modeRef.current = mode;

  function sendQuestion(text: string) {
    const pid = uploadRef.current?.presentation_id;
    if (pid) ask(text, pid, modeRef.current);
  }

  function handlePartialResult(text: string) {
    setQuestion((prev) => ({ ...prev, partialText: text, isConfirmed: false }));
    setScreen('recognized');
  }

  function handleFinalResult(text: string) {
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    sendQuestion(text); // 화면 전환을 기다리지 않고 바로 보낸다
    setScreen('recognized');
    setTimeout(() => setScreen('hud'), 1200);
  }

  const modeToggle = (
    <div className="border border-[#e5e7eb] flex p-[3px] rounded-[6px]">
      {(['keywords', 'answer'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`h-[28px] px-[10px] rounded-[4px] text-[12px] whitespace-nowrap ${
            mode === m ? 'bg-[#f26b1d] font-bold text-white' : 'font-medium text-[#6b7280]'
          }`}
        >
          {m === 'keywords' ? '키워드' : '추천 답변'}
        </button>
      ))}
    </div>
  );

  const { start: startRecognition } = useSpeechRecognition({
    onPartialResult: handlePartialResult,
    onFinalResult: handleFinalResult,
    onError: () => {
      setTextFromError(true);
      setScreen('textInput');
    },
  });

  function handleConnectMic() {
    setQuestion({ partialText: '', finalText: '', isConfirmed: false });
    setScreen('recognized');
    startRecognition();
  }

  function handleUploadFail(fileName: string, message: string) {
    setUploadError({ fileName, message });
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
              setUpload(null);
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
            onUploaded={setUpload}
            onUploadFail={handleUploadFail}
            onSkip={() => setScreen('preparing')}
            onStartMock={() => setScreen('mockPractice')}
          />
        </>
      )}

      {screen === 'uploadFailed' && (
        <>
          <Header onNavigate={setScreen} label={presentationName} rightText="2 / 3 준비" />
          <UploadFailedScreen
            fileName={uploadError?.fileName}
            message={uploadError?.message}
            onBackToList={() => setScreen('start')}
            onRetry={() => setScreen('upload')}
          />
        </>
      )}

      {screen === 'preparing' && upload && (
        <>
          <Header onNavigate={setScreen} label={presentationName} showProfile />
          <PreparingScreen
            presentationId={upload.presentation_id}
            onReady={() => setScreen('micConnect')}
            onRetry={() => setScreen('upload')}
          />
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
          <Header
            onNavigate={setScreen}
            compact
            rightText="대기 중"
            rightButtons={
              <button
                type="button"
                onClick={() => {
                  setTextFromError(false);
                  setScreen('textInput');
                }}
                className="border border-[#e5e7eb] h-[32px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] whitespace-nowrap"
              >
                글로 질문하기
              </button>
            }
          />
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
          <Header
            onNavigate={setScreen}
            compact
            rightText="음성 인식 대체"
            rightButtons={modeToggle}
            showProfile={false}
          />
          <TextInputFallback
            sttError={textFromError}
            onSubmit={(text) => {
              setQuestion({ partialText: text, finalText: text, isConfirmed: true });
              sendQuestion(text);
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
            rightText={lastResult ? `응답 ${lastResult.responseMs}ms` : '분석 중'}
            rightButtons={
              <>
                {modeToggle}
                <button
                  type="button"
                  onClick={() => {
                    setTextFromError(false);
                    setScreen('textInput');
                  }}
                  className="border border-[#e5e7eb] h-[32px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] whitespace-nowrap"
                >
                  글로 질문하기
                </button>
              </>
            }
            showProfile={false}
          />
          <Hud
            result={lastResult}
            answer={lastAnswer}
            mode={mode}
            notice={notice}
            question={question.finalText}
          />
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
          <SettingsScreen mode={mode} onModeChange={setMode} />
        </>
      )}
    </div>
  );
}

export default App;
