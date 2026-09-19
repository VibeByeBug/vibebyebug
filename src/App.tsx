import { useEffect, useRef, useState } from 'react';
import type { UploadResult } from './api';
import { Header } from './components/Header';
import { Hud } from './components/Hud';
import { Login } from './components/Login';
import { MicConnectScreen } from './components/MicConnectScreen';
import { MockPracticeScreen } from './components/MockPracticeScreen';
import { CorePracticeScreen } from './components/CorePracticeScreen';
import { GraphScreen } from './components/GraphScreen';
import { MaterialScreen } from './components/MaterialScreen';
import { MyHistoryScreen } from './components/MyHistoryScreen';
import { PreparingScreen } from './components/PreparingScreen';
import { RecognizedQuestion } from './components/RecognizedQuestion';
import { Report } from './components/Report';
import { SettingsScreen } from './components/SettingsScreen';
import { StartScreen } from './components/StartScreen';
import { TextInputFallback } from './components/TextInputFallback';
import { AskBar } from './components/AskBar';
import { AudienceControl, type AudienceCandidate } from './components/AudienceControl';
import { audienceChannel, openAudienceWindow, type AudienceSlide } from './audience';
import { UploadFailedScreen } from './components/UploadFailedScreen';
import { UploadScreen } from './components/UploadScreen';
import { useQaSocket } from './hooks/useQaSocket';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { mockRecognizedQuestion } from './mocks/questionMock';
import { DownloadIcon } from './components/icons';
import type { ScreenName } from './types/flow';
import type { AnswerMode } from './types/qa';


function App() {
  // 처음 화면은 로그인 없이 보는 랜딩(슬레이트와 사용 방법). 발표를 시작할 때 로그인을 받는다.
  const [screen, setScreen] = useState<ScreenName>('start');
  const [loggedIn, setLoggedIn] = useState(false);
  // 로그인 전에 슬레이트에 적어둔 발표 이름. 로그인하고 나면 이 이름으로 업로드를 이어간다.
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [presentationName, setPresentationName] = useState('캡스톤 디자인 최종 발표');
  const [question, setQuestion] = useState(mockRecognizedQuestion);
  const [mockProgress, setMockProgress] = useState({ index: 0, total: 7 });
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<{ fileName: string; message: string } | null>(null);
  // 실전 화면은 추천 답변(위)과 흐름도(아래)를 항상 같이 본다. 키워드, 흐름도, 추천 답변 중 고르던 버튼은 없앴다.
  const mode: AnswerMode = 'both';
  const [textFromError, setTextFromError] = useState(true); // 음성 인식 실패로 온 입력인지
  const { lastResult, lastAnswer, lastFlow, notice, ask } = useQaSocket();

  // 음성 인식 콜백은 인식을 시작한 순간의 값을 붙잡고 있어서, 최신 발표와 모드는 ref 로 읽는다
  const uploadRef = useRef(upload);
  const modeRef = useRef(mode);
  uploadRef.current = upload;
  modeRef.current = mode;

  // 몇 번째 질문인지. 실전 화면의 CUE 번호와 슬레이트 줄무늬 신호에 쓴다.
  const [cueNo, setCueNo] = useState(0);

  function sendQuestion(text: string) {
    const pid = uploadRef.current?.presentation_id;
    if (pid) {
      setCueNo((n) => n + 1);
      ask(text, pid, modeRef.current);
    }
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

  const { start: startRecognition, stop: stopRecognition, listening } = useSpeechRecognition({
    onPartialResult: handlePartialResult,
    onFinalResult: handleFinalResult,
    onError: () => {
      setTextFromError(true);
      setScreen('textInput');
    },
  });

  // 실전 화면을 벗어나면 마이크를 끈다 (설정, 리포트 등으로 가도 계속 듣고 있으면 안 된다)
  useEffect(() => {
    if (!['recognized', 'hud', 'textInput', 'micConnect', 'graph'].includes(screen)) stopRecognition();
  }, [screen, stopRecognition]);

  // 논리 지도 화면. 보고 나면 원래 화면으로 돌아간다.
  const [graphBack, setGraphBack] = useState<ScreenName>('hud');
  const graphButton = (
    <button
      type="button"
      onClick={() => {
        setGraphBack(screen);
        setScreen('graph');
      }}
      className="border border-[#e5e7eb] h-[32px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] whitespace-nowrap"
    >
      지식 지도
    </button>
  );

  // 자료 보강 화면. 논리 지도에서 슬라이드를 골라 들어오면 그 슬라이드부터 연다.
  const [materialBack, setMaterialBack] = useState<ScreenName>('hud');
  const [materialPage, setMaterialPage] = useState<number | undefined>(undefined);
  const openMaterial = (back: ScreenName, page?: number) => {
    setMaterialBack(back);
    setMaterialPage(page);
    setScreen('material');
  };
  const materialButton = (
    <button
      type="button"
      onClick={() => openMaterial(screen)}
      className="border border-[#e5e7eb] h-[32px] px-[12px] rounded-[6px] font-bold text-[13px] text-[#6b7280] whitespace-nowrap"
    >
      자료 보강
    </button>
  );

  const micToggle = (
    <button
      type="button"
      onClick={() => (listening ? stopRecognition() : startRecognition())}
      className={`flex gap-[6px] h-[32px] items-center px-[12px] rounded-[6px] font-bold text-[13px] whitespace-nowrap ${
        listening ? 'bg-[#bf382e] text-white' : 'border border-[#e5e7eb] text-[#6b7280]'
      }`}
    >
      <span className={`rounded-full size-[8px] ${listening ? 'bg-white animate-pulse' : 'bg-[#9ca3af]'}`} />
      {listening ? '마이크 끄기' : '마이크 켜기'}
    </button>
  );

  // ── 청중 화면 (프로젝터에 띄운 두 번째 창) ──────────────────────────────
  // 발표자가 고른 근거 슬라이드 원본만 보낸다. 자동으로 보내지 않는다.
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceSlide, setAudienceSlide] = useState<AudienceSlide | null>(null);
  const audienceSlideRef = useRef<AudienceSlide | null>(null);
  audienceSlideRef.current = audienceSlide;
  const channelRef = useRef<ReturnType<typeof audienceChannel> | null>(null);
  useEffect(() => {
    const ch = audienceChannel((m) => {
      if (m.type === 'hello') {
        // 청중 화면이 새로 열렸거나 새로고침됐다. 지금 띄워야 할 것을 다시 보낸다.
        setAudienceOpen(true);
        const cur = audienceSlideRef.current;
        ch.send(cur ? { type: 'show', slide: cur } : { type: 'clear' });
      }
      if (m.type === 'bye') setAudienceOpen(false);
    });
    channelRef.current = ch;
    return () => ch.close();
  }, []);

  // 띄울 후보: 근거 카드의 슬라이드, 그다음 흐름도 칸의 슬라이드 (겹치는 슬라이드는 한 번)
  const audienceCandidates: AudienceCandidate[] = [];
  for (const s of lastResult?.sources ?? []) {
    if (!audienceCandidates.some((c) => c.page === s.slide)) audienceCandidates.push({ page: s.slide, quote: s.quote });
  }
  for (const st of lastFlow?.steps ?? []) {
    if (st.slide && !audienceCandidates.some((c) => c.page === st.slide))
      audienceCandidates.push({ page: st.slide, quote: st.text });
  }
  audienceCandidates.splice(4);

  function sendToAudience(i: number) {
    const c = audienceCandidates[i];
    const pid = upload?.presentation_id;
    if (!c || !pid) return;
    const slide = { presentationId: pid, page: c.page, quote: c.quote };
    setAudienceSlide(slide);
    channelRef.current?.send({ type: 'show', slide });
  }

  function clearAudience() {
    setAudienceSlide(null);
    channelRef.current?.send({ type: 'clear' });
  }

  // 숫자키 1~4 로 보내고 0 으로 내린다 (글을 적는 중에는 무시).
  // Esc 는 쓰지 않는다: 전체 화면을 끄거나 메뉴를 닫으려고 누르다가 청중 화면이 내려갔다.
  useEffect(() => {
    if (screen !== 'hud' || !audienceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '4') sendToAudience(Number(e.key) - 1);
      if (e.key === '0') clearAudience();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  // 글로 묻기 (실전 화면 아래 입력줄, 글로 질문하기 화면). 마이크는 켜둔 채로 둔다.
  function askByText(text: string) {
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    sendQuestion(text);
    setScreen('hud');
  }

  function beginPresentation(title: string) {
    setPresentationName(title);
    setUpload(null);
    setScreen('upload');
  }

  // 헤더의 이동. 로그인한 상태에서 'login' 으로 가는 건 로그아웃이다(랜딩으로 돌아간다).
  function navigate(target: ScreenName) {
    if (target === 'login' && loggedIn) {
      setLoggedIn(false);
      setScreen('start');
      return;
    }
    setScreen(target);
  }

  return (
    <div className="theme-dark flex flex-col min-h-screen w-full bg-[#15110d] text-[#f5f5f4]">
      {screen === 'login' && (
        <Login
          onLogin={() => {
            setLoggedIn(true);
            if (pendingTitle !== null) {
              beginPresentation(pendingTitle);
              setPendingTitle(null);
            } else {
              setScreen('start');
            }
          }}
          onBack={() => setScreen('start')}
          pendingTitle={pendingTitle}
        />
      )}

      {screen === 'start' && (
        <>
          <Header onNavigate={navigate} guest={!loggedIn} />
          <StartScreen
            loggedIn={loggedIn}
            onStart={(title) => {
              if (loggedIn) {
                beginPresentation(title);
              } else {
                setPendingTitle(title);
                setScreen('login');
              }
            }}
            onOpenReport={() => setScreen('report')}
          />
        </>
      )}

      {screen === 'upload' && (
        <>
          <Header onNavigate={navigate} label={presentationName} rightText="2 / 3 준비" />
          <UploadScreen
            onUploaded={setUpload}
            onUploadFail={handleUploadFail}
            onSkip={() => setScreen('preparing')}
            onStartMock={() => setScreen('mockPractice')}
            // 업로드 화면은 다시 열면 결과가 비므로, 자료 보강을 마치면 준비 화면으로 간다
            onAddMaterial={() => openMaterial('preparing')}
          />
        </>
      )}

      {screen === 'uploadFailed' && (
        <>
          <Header onNavigate={navigate} label={presentationName} rightText="2 / 3 준비" />
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
          <Header onNavigate={navigate} label={presentationName} showProfile rightButtons={materialButton} />
          <PreparingScreen
            presentationId={upload.presentation_id}
            onReady={() => setScreen('micConnect')}
            onRetry={() => setScreen('upload')}
          />
        </>
      )}

      {screen === 'corePractice' && upload && (
        <>
          <Header onNavigate={navigate} label="기본 질문 연습" />
          <CorePracticeScreen presentationId={upload.presentation_id} onFinish={() => setScreen('preparing')} />
        </>
      )}

      {screen === 'material' && upload && (
        <>
          <Header onNavigate={navigate} label="자료 보강" showProfile={false} />
          <MaterialScreen
            key={materialPage ?? 'all'}
            presentationId={upload.presentation_id}
            initialPage={materialPage}
            onBack={() => setScreen(materialBack)}
          />
        </>
      )}

      {screen === 'graph' && upload && (
        <>
          <Header onNavigate={navigate} label="지식 지도" showProfile={false} />
          <GraphScreen
            presentationId={upload.presentation_id}
            onBack={() => setScreen(graphBack)}
            onAddNote={(page) => openMaterial('graph', page)}
          />
        </>
      )}

      {screen === 'mockPractice' && (
        <>
          <Header
            onNavigate={navigate}
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
            onNavigate={navigate}
            compact
            rightText="대기 중"
            rightButtons={
              <>
              {materialButton}
              {graphButton}
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
          />
          <MicConnectScreen onConnect={handleConnectMic} />
        </>
      )}

      {screen === 'recognized' && (
        <>
          <Header
            onNavigate={navigate}
            dark
            compact
            listening={listening}
            label="마이크 꺼짐"
            rightText={listening ? '분석 준비 중' : undefined}
            rightButtons={micToggle}
            showProfile={false}
          />
          <RecognizedQuestion
            partialText={question.partialText}
            finalText={question.finalText}
            isConfirmed={question.isConfirmed}
          />
          <AskBar onAsk={askByText} />
        </>
      )}

      {screen === 'textInput' && (
        <>
          <Header
            onNavigate={navigate}
            compact
            rightText="음성 인식 대체"
            rightButtons={
              <>
                {micToggle}
              </>
            }
            showProfile={false}
          />
          <TextInputFallback sttError={textFromError} onSubmit={askByText} />
        </>
      )}

      {screen === 'hud' && (
        <>
          <Header
            onNavigate={navigate}
            dark
            cueKey={cueNo}
            compact
            listening={listening}
            label="마이크 꺼짐"
            rightText={lastResult ? `응답 ${lastResult.responseMs}ms` : '분석 중'}
            rightButtons={
              <>
                {micToggle}
                {graphButton}
                {materialButton}
              </>
            }
            showProfile={false}
          />
          <AudienceControl
            candidates={audienceCandidates}
            current={audienceSlide?.page ?? null}
            open={audienceOpen}
            onOpen={openAudienceWindow}
            onSend={sendToAudience}
            onClear={clearAudience}
          />
          <Hud
            result={lastResult}
            answer={lastAnswer}
            flow={lastFlow}
            mode={mode}
            notice={notice}
            question={question.finalText}
            cueNo={cueNo}
          />
          <AskBar onAsk={askByText} />
        </>
      )}

      {screen === 'report' && (
        <>
          <Header
            onNavigate={navigate}
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
          <Header onNavigate={navigate} label="내 기록" activeMenu="history" />
          <MyHistoryScreen onOpenReport={() => setScreen('report')} />
        </>
      )}

      {screen === 'settings' && (
        <>
          <Header onNavigate={navigate} label="설정" activeMenu="settings" />
          <SettingsScreen />
        </>
      )}
    </div>
  );
}

export default App;
