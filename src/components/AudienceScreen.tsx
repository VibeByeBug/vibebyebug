import { useEffect, useState } from 'react';
import { API_URL } from '../api';
import { audienceChannel, type AudienceSlide } from '../audience';

// 청중 화면. 프로젝터에 띄우는 두 번째 창이다 (주소 뒤에 ?audience=1).
// 발표자가 고른 슬라이드 원본을 크게 띄우고, 근거가 된 줄에 형광펜을 긋는다.
// 아무것도 안 보낸 동안에는 질의응답 슬레이트만 떠 있다.
export function AudienceScreen() {
  const [slide, setSlide] = useState<AudienceSlide | null>(null);
  const [boxes, setBoxes] = useState<number[][]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ch = audienceChannel((m) => {
      if (m.type === 'show') setSlide(m.slide);
      if (m.type === 'clear') setSlide(null);
      // 발표자 화면이 새로고침돼서 청중 화면이 열려 있는 줄 모른다. 다시 알려준다.
      if (m.type === 'ping') ch.send({ type: 'hello' });
    });
    ch.send({ type: 'hello' });
    const bye = () => ch.send({ type: 'bye' });
    window.addEventListener('beforeunload', bye);
    document.title = 'Ready-Q 청중 화면';
    return () => {
      window.removeEventListener('beforeunload', bye);
      ch.close();
    };
  }, []);

  // 형광펜 위치는 이미지가 뜬 뒤에 긋는다 (먼저 그으면 빈 자리에 줄만 보인다)
  useEffect(() => {
    setLoaded(false);
    setBoxes([]);
    if (!slide?.quote) return;
    const url = `${API_URL}/api/slides/${slide.presentationId}/${slide.page}/highlight?q=${encodeURIComponent(slide.quote)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { boxes: [] }))
      .then((d) => setBoxes(d.boxes ?? []))
      .catch(() => setBoxes([]));
  }, [slide]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#0b0907] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1200px 700px at 50% 40%, rgba(255,181,71,0.10), transparent 70%)' }}
      />

      {slide ? (
        <div key={`${slide.presentationId}-${slide.page}`} className="rise-in relative flex h-full w-full items-center justify-center p-[3vh]">
          <div className="relative max-h-full max-w-full">
            <img
              src={`${API_URL}/api/slides/${slide.presentationId}/${slide.page}.png`}
              alt={`${slide.page}번 슬라이드`}
              onLoad={() => setLoaded(true)}
              className="block max-h-[92vh] max-w-[94vw] rounded-[6px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
            />
            {loaded &&
              boxes.map(([x0, y0, x1, y1], i) => (
                <span
                  key={i}
                  className="highlight-sweep absolute rounded-[4px]"
                  style={{
                    left: `${x0 * 100}%`,
                    top: `${y0 * 100}%`,
                    width: `${(x1 - x0) * 100}%`,
                    height: `${(y1 - y0) * 100}%`,
                  }}
                />
              ))}
            <span className="absolute -top-[2px] left-0 -translate-y-full pb-[8px] font-display text-[28px] leading-none text-white/80">
              P.{slide.page}
            </span>
          </div>
        </div>
      ) : (
        // 대기: 질의응답 슬레이트
        <div className="relative flex w-full max-w-[640px] flex-col">
          <div className="slate-stripes h-[44px] rounded-t-[8px]" />
          <div className="flex flex-col items-center gap-[10px] rounded-b-[12px] bg-[#111111] px-[40px] py-[48px] text-center">
            <span className="font-display text-[88px] leading-none tracking-[2px]">Q&amp;A</span>
            <span className="font-hand text-[40px] text-white/70">질문을 받고 있습니다</span>
          </div>
        </div>
      )}
    </div>
  );
}
