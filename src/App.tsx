import { useEffect, useRef, useState } from 'react';
import type { SavedPresentation, UploadResult } from './api';
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
import { cleanQuestion } from './cleanQuestion';
import { loadSourceCount, saveSourceCount, type SourceCount } from './settings';
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
  const [mockProgress, setMockProgress] = useState({ index: 0, total: 0 });
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<{ fileName: string; message: string } | null>(null);
  // 실전 화면은 추천 답변(위)과 흐름도(아래)를 항상 같이 본다. 키워드, 흐름도, 추천 답변 중 고르던 버튼은 없앴다.
  const mode: AnswerMode = 'both';
  const [textFromError, setTextFromError] = useState(true); // 음성 인식 실패로 온 입력인지
  // 실전 화면에 한 번에 보여줄 근거 카드 수. 이 브라우저에 저장해 두고 다음 발표에도 쓴다.
  const [sourceCount, setSourceCount] = useState<SourceCount>(loadSourceCount);
  const { lastResult, lastAnswer, lastFlow, notice, ask } = useQaSocket();

  // 음성 인식 콜백은 인식을 시작한 순간의 값을 붙잡고 있어서, 최신 발표와 모드는 ref 로 읽는다
  const uploadRef = useRef(upload);
  const modeRef = useRef(mode);
  uploadRef.current = upload;
  modeRef.current = mode;

  // 리포트로 열어 볼 발표. 내 기록에서 고르면 그 발표, 아니면 지금 하는 발표.
  const [reportTarget, setReportTarget] = useState<{ pid: string; title: string } | null>(null);

  // 몇 번째 질문인지. 실전 화면의 CUE 번호와 슬레이트 줄무늬 신호에 쓴다.
  const [cueNo, setCueNo] = useState(0);

  function sendQuestion(text: string) {
    const pid = uploadRef.current?.presentation_id;
    if (pid) {
      setCueNo((n) => n + 1);
      ask(text, pid, modeRef.current);
    }
  }

  // ── 마이크: 발표자가 켜고 끈다 ─────────────────────────────────────────
  // 브라우저 음성 인식은 말이 잠깐 멈출 때마다 문장을 끊는다. 예전에는 끊긴 조각마다 질문으로 보내서
  // 청중이 숨을 고르면 질문 앞부분만 검색됐다. 이제 켠 순간부터 끈 순간까지 들은 말을 모아 한 질문으로 보낸다.
  const heardRef = useRef(''); // 이번 질문에서 확정된 조각들
  const interimRef = useRef(''); // 아직 확정 안 된 마지막 조각
  const finishingRef = useRef(false); // 발표자가 "질문 끝"을 눌렀다 (인식이 완전히 끝나면 보낸다)
  const [questionMiss, setQuestionMiss] = useState(false); // 끝냈는데 알아들은 말이 없었다

  function handlePartialResult(text: string) {
    interimRef.current = text;
    const shown = heardRef.current ? `${heardRef.current} ${text}` : text;
    setQuestion({ partialText: shown, finalText: '', isConfirmed: false });
  }

  function handleFinalResult(text: string) {
    interimRef.current = '';
    heardRef.current = heardRef.current ? `${heardRef.current} ${text}` : text;
    setQuestion({ partialText: heardRef.current, finalText: '', isConfirmed: false });
  }

  // 모은 말을 정리해서 한 질문으로 보낸다. 인식이 끝났을 때와 늦을 때 대비한 시간 제한, 둘 중 먼저 오는 쪽에서 한 번만.
  function commitQuestion() {
    if (!finishingRef.current) return;
    finishingRef.current = false;
    const raw = [heardRef.current, interimRef.current].filter(Boolean).join(' ');
    heardRef.current = '';
    interimRef.current = '';
    const text = cleanQuestion(raw);
    if (!text) {
      setQuestion({ partialText: '', finalText: '', isConfirmed: false });
      setQuestionMiss(true);
      return;
    }
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    sendQuestion(text);
    setTimeout(() => setScreen((s) => (s === 'recognized' ? 'hud' : s)), 900);
  }

  const {
    start: startRecognition,
    stop: stopRecognition,
    listening,
  } = useSpeechRecognition({
    onPartialResult: handlePartialResult,
    onFinalResult: handleFinalResult,
    onEnd: commitQuestion,
    onError: () => {
      finishingRef.current = false;
      setTextFromError(true);
      setScreen('textInput');
    },
  });

  // 질문 듣기 시작: 받아 적는 화면으로 가서 처음부터 모은다
  function startQuestion() {
    heardRef.current = '';
    interimRef.current = '';
    finishingRef.current = false;
    setQuestionMiss(false);
    setQuestion({ partialText: '', finalText: '', isConfirmed: false });
    setScreen('recognized');
    startRecognition();
  }

  // 질문 끝: 인식을 멈추고, 끄는 순간 말하던 마지막 조각까지 받은 뒤 보낸다
  function finishQuestion() {
    finishingRef.current = true;
    stopRecognition();
    setTimeout(commitQuestion, 700);
  }

  const toggleQuestion = () => (listening ? finishQuestion() : startQuestion());

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
      onClick={(e) => {
        e.currentTarget.blur(); // 눌린 버튼에 포커스가 남으면 다음 Space 가 버튼을 한 번 더 누른다
        toggleQuestion();
      }}
      title="Space 로도 켜고 끌 수 있어요"
      className={`flex gap-[6px] h-[32px] items-center px-[12px] rounded-[6px] font-bold text-[13px] whitespace-nowrap ${
        listening ? 'bg-[#e5322d] text-white' : 'border border-[#e5e7eb] text-[#6b7280]'
      }`}
    >
      <span className={`rounded-full size-[8px] ${listening ? 'bg-white animate-pulse' : 'bg-[#e5322d]'}`} />
      {listening ? '질문 끝' : '질문 듣기'}
      <kbd className={`font-mono text-[11px] ${listening ? 'text-white/70' : 'text-[#9ca3af]'}`}>Space</kbd>
    </button>
  );

  // Space 로 질문 듣기와 질문 끝을 오간다 (글을 적는 중에는 무시). 발표 리모컨 버튼을 Space 로 맞춰두면 손에서 바로 된다.
  useEffect(() => {
    if (screen !== 'hud' && screen !== 'recognized') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.code !== 'Space' && e.key !== ' ') || e.repeat || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      toggleQuestion();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 청중 화면 (프로젝터에 띄운 두 번째 창) ──────────────────────────────
  // 발표자가 고른 근거 슬라이드 원본만 보낸다. 자동으로 보내지 않는다.
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [audienceBlocked, setAudienceBlocked] = useState(false); // 팝업 차단에 막혔다
  const [audienceSlide, setAudienceSlide] = useState<AudienceSlide | null>(null);
  const audienceSlideRef = useRef<AudienceSlide | null>(null);
  audienceSlideRef.current = audienceSlide;
  const channelRef = useRef<ReturnType<typeof audienceChannel> | null>(null);
  useEffect(() => {
    const ch = audienceChannel((m) => {
      if (m.type === 'hello') {
        setAudienceBlocked(false);
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

  // 마이크 연결: 바로 듣지 않고 질문 대기 화면으로 간다. 질문이 시작되면 발표자가 켠다.
  function handleConnectMic() {
    heardRef.current = '';
    interimRef.current = '';
    setQuestionMiss(false);
    setQuestion({ partialText: '', finalText: '', isConfirmed: false });
    setScreen('recognized');
  }

  function handleUploadFail(fileName: string, message: string) {
    setUploadError({ fileName, message });
    setScreen('uploadFailed');
  }

  // 글로 묻기 (실전 화면 아래 입력줄, 글로 질문하기 화면). 마이크는 켜둔 채로 둔다.
  function askByText(typed: string) {
    const text = cleanQuestion(typed) || typed.trim();
    setQuestion({ partialText: text, finalText: text, isConfirmed: true });
    sendQuestion(text);
    setScreen('hud');
  }

  // 서버에 남아 있는 발표를 다시 연다. 파일을 또 올리지 않고 준비 화면으로 바로 간다.
  // (준비 상태를 물으면 서버가 알아서 다시 준비를 시작한다)
  function resumePresentation(p: SavedPresentation) {
    setPresentationName(p.title);
    setUpload({ presentation_id: p.presentation_id, filename: p.title, slides: 0, sizeMb: p.size_mb });
    setScreen('preparing');
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
            onOpenReport={() => {
              setReportTarget(null);
              setScreen('myHistory');
            }}
            onResume={resumePresentation}
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

      {screen === 'mockPractice' && upload && (
        <>
          <Header
            onNavigate={navigate}
            label="모의 연습"
            rightText={mockProgress.total ? `${mockProgress.index + 1} / ${mockProgress.total} 문항` : undefined}
          />
          <MockPracticeScreen
            presentationId={upload.presentation_id}
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
            label="Space 로 질문 듣기"
            rightText={listening ? '듣는 중, 질문이 끝나면 Space' : undefined}
            rightButtons={micToggle}
            showProfile={false}
          />
          <RecognizedQuestion
            partialText={question.partialText}
            finalText={question.finalText}
            isConfirmed={question.isConfirmed}
            listening={listening}
            missed={questionMiss}
            onToggle={toggleQuestion}
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
            label="Space 로 질문 듣기"
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
            blocked={audienceBlocked}
            onOpen={() => setAudienceBlocked(!openAudienceWindow())}
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
            sourceCount={sourceCount}
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
                  onClick={() => window.print()}
                  title="브라우저 인쇄 창에서 PDF 로 저장할 수 있어요"
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
          <Report presentationName={reportTarget?.title ?? presentationName} presentationId={reportTarget?.pid ?? upload?.presentation_id} />
        </>
      )}

      {screen === 'myHistory' && (
        <>
          <Header onNavigate={navigate} label="내 기록" activeMenu="history" />
          <MyHistoryScreen
            onOpenReport={(pid, title) => {
              setReportTarget({ pid, title });
              setScreen('report');
            }}
          />
        </>
      )}

      {screen === 'settings' && (
        <>
          <Header onNavigate={navigate} label="설정" activeMenu="settings" />
          <SettingsScreen
            sourceCount={sourceCount}
            onSourceCountChange={(n) => {
              setSourceCount(n);
              saveSourceCount(n);
            }}
          />
        </>
      )}
    </div>
  );
}

export default App;
