import { missedSources, typeDistribution } from '../mocks/reportMock';

interface ReportProps {
  presentationName: string;
}

export function Report({ presentationName }: ReportProps) {
  return (
    <div className="flex flex-1 flex-col gap-[26px] items-start px-[44px] py-[34px] w-full">
      <div className="flex flex-col gap-[6px] items-center text-center w-full">
        <p className="font-black text-[30px] text-[#1a1a1a] tracking-[-0.84px] leading-[38px] w-full">
          {presentationName}
        </p>
        <p className="font-normal text-[14px] text-[#6b7280] w-full">9월 15일, Q&amp;A 14분, 질문 12건, 평균 응답 417ms</p>
      </div>

      <div className="flex flex-col gap-[14px] items-start w-full">
        <p className="font-bold text-[15px] text-[#1a1a1a] w-full">처리 결과</p>
        <div className="border border-[#e5e7eb] flex h-[44px] overflow-hidden rounded-[6px] w-full">
          <div className="bg-[#f26b1d] flex h-full items-center pl-[16px]" style={{ width: '67%' }}>
            <p className="font-bold text-[15px] text-white whitespace-nowrap">근거 표시 8개, 67%</p>
          </div>
          <div className="bg-[#f8a876] flex h-full items-center justify-center" style={{ width: '17%' }}>
            <p className="font-bold text-[14px] text-[#4d260d] whitespace-nowrap">2개, 17%</p>
          </div>
          <div className="bg-[#fde3d1] flex h-full items-center justify-center" style={{ width: '17%' }}>
            <p className="font-bold text-[14px] text-[#4d260d] whitespace-nowrap">2개, 17%</p>
          </div>
        </div>
        <div className="flex gap-[24px] items-start w-full">
          <div className="flex gap-[8px] items-center">
            <span className="bg-[#f26b1d] rounded-[2px] size-[10px]" />
            <p className="font-medium text-[13px] text-[#6b7280] whitespace-nowrap">근거 표시</p>
          </div>
          <div className="flex gap-[8px] items-center">
            <span className="bg-[#f8a876] border border-[#e5e7eb] rounded-[2px] size-[10px]" />
            <p className="font-medium text-[13px] text-[#6b7280] whitespace-nowrap">근거 없음</p>
          </div>
          <div className="flex gap-[8px] items-center">
            <span className="bg-[#fde3d1] border border-[#e5e7eb] rounded-[2px] size-[10px]" />
            <p className="font-medium text-[13px] text-[#6b7280] whitespace-nowrap">잡음 무시</p>
          </div>
        </div>
      </div>

      <div className="flex gap-[20px] items-start w-full">
        <div className="border border-[#e5e7eb] flex flex-col gap-[10px] items-start justify-center px-[26px] py-[24px] rounded-[6px] self-stretch w-[532px]">
          <p className="font-bold text-[14px] text-[#6b7280] w-full">예상 질문 적중률</p>
          <div className="flex gap-[12px] items-baseline w-full whitespace-nowrap">
            <p className="font-black text-[80px] text-[#f26b1d] tracking-[-4.4px]">86%</p>
            <p className="font-bold text-[20px] text-[#6b7280]">6 / 7</p>
          </div>
          <p className="font-normal text-[14px] text-[#6b7280] leading-[22px] w-full">
            연습한 7개 중 6개가 실제로 나왔습니다.
          </p>
        </div>
        <div className="border border-[#e5e7eb] flex flex-col gap-[16px] px-[26px] py-[24px] rounded-[6px] w-[798px]">
          <p className="font-bold text-[15px] text-[#1a1a1a] w-full">질문 유형 분포</p>
          <div className="flex flex-col gap-[13px] w-full">
            {typeDistribution.map((d) => (
              <div key={d.type} className="flex gap-[14px] items-center w-full">
                <p className="font-medium text-[14px] text-[#6b7280] w-[76px]">{d.type}</p>
                <div className="bg-[#f3f4f6] flex flex-1 h-[10px] overflow-hidden rounded-[5px]">
                  <div className="bg-[#f26b1d] h-[10px] rounded-[5px]" style={{ width: `${d.ratio * 100}%` }} />
                </div>
                <p className="font-bold text-[14px] text-[#1a1a1a] text-right w-[44px]">{d.count}건</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[12px] items-start w-full">
        <div className="flex items-baseline justify-between w-full">
          <p className="font-bold text-[15px] text-[#1a1a1a]">연습에서 자주 놓친 근거</p>
          <p className="font-normal text-[13px] text-[#6b7280]">다음 발표 전에 먼저 외우세요</p>
        </div>
        <div className="flex flex-col w-full">
          {missedSources.map((m) => (
            <div key={m.page} className="border-t border-[#e5e7eb] flex gap-[18px] items-center px-[4px] py-[12px] w-full">
              <span className="bg-white border border-[#e6e6e6] flex items-center justify-center rounded-[6px] shrink-0 h-[41px] w-[72px]">
                <span className="font-mono text-[9px] text-[#9ca3af]">p{String(m.page).padStart(3, '0')}</span>
              </span>
              <p className="font-black text-[21px] text-[#1a1a1a] w-[56px]">p.{m.page}</p>
              <p className="flex-1 font-medium text-[17px] text-[#1a1a1a]">{m.content}</p>
              <p className="font-bold text-[15px] text-[#1a1a1a] text-center whitespace-nowrap">
                {m.totalCount}번 중 {m.missedCount}번 놓침
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
