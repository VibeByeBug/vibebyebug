// 발표자 화면과 청중 화면(프로젝터에 띄운 두 번째 창)을 잇는 통로.
// 같은 브라우저의 창끼리는 BroadcastChannel 로 바로 주고받는다(서버를 거치지 않는다).
//
// 청중 화면에는 슬라이드 원본과 근거 줄 위치만 보낸다. AI 가 만든 문장은 보내는 통로 자체가 없다.

export interface AudienceSlide {
  presentationId: string;
  page: number;
  quote: string; // 근거 줄 (형광펜 위치를 찾는 데만 쓴다. 청중 화면에 글자로 띄우지 않는다)
}

export type AudienceMessage =
  | { type: 'show'; slide: AudienceSlide }
  | { type: 'clear' }
  | { type: 'hello' } // 청중 화면이 열렸다 (발표자 화면이 지금 상태를 다시 보내준다)
  | { type: 'bye' }; // 청중 화면이 닫혔다

const NAME = 'readyq-audience';

export function audienceChannel(onMessage: (m: AudienceMessage) => void) {
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e) => onMessage(e.data as AudienceMessage);
  return {
    send: (m: AudienceMessage) => ch.postMessage(m),
    close: () => ch.close(),
  };
}

export function openAudienceWindow() {
  // 프로젝터 쪽으로 끌어다 놓고 F11 로 전체 화면
  return window.open(`${location.origin}/?audience=1`, 'readyq-audience', 'popup,width=1280,height=720');
}
