import { useCallback, useEffect, useState } from 'react';
import type { SourceCount } from '../settings';
import { MicSmallIcon, WatchIcon } from './icons';

// 설정. 지금 실제로 동작하는 것만 둔다.
// 답변 보기(키워드, 흐름도, 추천 답변) 고르기는 없앴다. 실전 화면은 추천 답변과 흐름도를 항상 같이 보여준다.
// 마이크는 고를 수 없다. 브라우저 음성 인식(Web Speech API)은 입력 장치를 지정할 수 없고 시스템 기본 마이크를 쓴다.
// 그래서 고르는 칸 대신 지금 쓰는 장치를 보여주고, 바꾸는 방법을 알려준다.

export function SettingsScreen({
  sourceCount,
  onSourceCountChange,
}: {
  sourceCount: SourceCount;
  onSourceCountChange: (n: SourceCount) => void;
}) {
  const [mic, setMic] = useState<string | null>(null);
  const [needPermission, setNeedPermission] = useState(false);

  const readMic = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMic('이 브라우저에서는 마이크를 찾을 수 없어요');
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    // 권한을 주기 전에는 장치 이름이 빈 문자열로 온다
    const named = inputs.find((d) => d.label);
    if (!named) {
      setNeedPermission(inputs.length > 0);
      setMic(inputs.length ? null : '연결된 마이크가 없어요');
      return;
    }
    setNeedPermission(false);
    setMic(named.label);
  }, []);

  useEffect(() => {
    readMic();
  }, [readMic]);

  async function allowMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // 이름만 확인하고 바로 끈다
      await readMic();
    } catch {
      setMic('마이크 권한이 거부됐어요. 주소창 왼쪽 자물쇠에서 허용해주세요');
      setNeedPermission(false);
    }
  }

  return (
    <div className="flex flex-col pb-[44px] pt-[34px] px-[16px] sm:px-[44px] w-full max-w-[1000px] mx-auto">
      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-black text-[30px] text-white tracking-[-0.8px] w-full text-center">설정</p>
        <div className="flex flex-col items-start w-full">
          <Row title="근거 표시 개수" desc="실전 화면에 한 번에 보여줄 근거 카드 수. 나머지는 접어 두고 펼쳐서 봅니다">
            <div className="flex gap-[8px] items-start">
              {([3, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSourceCountChange(n)}
                  className={`flex h-[40px] items-center px-[20px] rounded-[8px] font-bold text-[15px] transition-colors ${
                    sourceCount === n ? 'bg-[#f26b1d] text-white' : 'border border-white/20 text-white/65 hover:text-white'
                  }`}
                >
                  {n}개
                </button>
              ))}
            </div>
          </Row>

          <Row title="마이크" desc="브라우저 음성 인식은 시스템 기본 마이크를 씁니다. 바꾸려면 윈도우 소리 설정에서 기본 장치를 바꿔주세요">
            <div className="flex flex-1 flex-wrap gap-[10px] items-center">
              <span className="size-[17px] text-white/55 shrink-0">
                <MicSmallIcon />
              </span>
              <p className="font-medium text-[15px] text-white/85 break-keep">{mic ?? '마이크 권한을 허용하면 장치 이름이 보여요'}</p>
              {needPermission && (
                <button
                  type="button"
                  onClick={allowMic}
                  className="h-[34px] px-[14px] rounded-[8px] border border-white/20 font-bold text-[13px] text-white/75 hover:border-white/45"
                >
                  마이크 확인
                </button>
              )}
            </div>
          </Row>

          <Row title="갤럭시 워치" desc="손목에서 질문 유형과 슬라이드 번호 보기">
            <div className="flex flex-1 gap-[10px] items-center">
              <span className="size-[18px] text-white/35">
                <WatchIcon />
              </span>
              {/* 아직 만들지 않은 기능이다. 연결된 것처럼 보이면 시연에서 거짓말이 된다 */}
              <p className="font-bold text-[15px] text-white/45 whitespace-nowrap">준비 중</p>
            </div>
          </Row>
        </div>
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 last:border-b flex flex-wrap gap-[14px] sm:gap-[20px] items-center px-[4px] py-[16px] w-full">
      <div className="flex flex-col gap-[4px] w-full sm:w-[300px]">
        <p className="font-bold text-[16px] text-white w-full">{title}</p>
        <p className="font-normal text-[13px] text-white/50 w-full break-keep">{desc}</p>
      </div>
      {children}
    </div>
  );
}
