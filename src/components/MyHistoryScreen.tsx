import { accuracyByType, frequentlyMissed, historyRecords } from '../mocks/historyMock';

interface MyHistoryScreenProps {
  onOpenReport: () => void;
}

const weakestType = accuracyByType.reduce((min, cur) => (cur.value < min.value ? cur : min));

export function MyHistoryScreen({ onOpenReport }: MyHistoryScreenProps) {
  return (
    <div className="flex flex-col gap-[30px] items-start pb-[44px] pt-[34px] px-[44px] w-full">
      <div className="border-b border-[#e5e7eb] flex gap-[36px] items-center pb-[22px] w-full">
        <div className="flex gap-[14px] items-center">
          <span className="bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center rounded-full shrink-0 size-[48px]">
            <span className="font-bold text-[17px] text-[#6b7280]">사</span>
          </span>
          <div className="flex flex-col gap-[5px]">
            <p className="font-bold text-[24px] text-[#1a1a1a] tracking-[-0.72px] whitespace-nowrap">사용자</p>
            <p className="font-normal text-[13px] text-[#6b7280] whitespace-nowrap">user@gmail.com</p>
          </div>
        </div>
        <div className="border-l border-[#e5e7eb] flex gap-[36px] pl-[28px]">
          <div className="flex flex-col gap-[6px]">
            <p className="font-medium text-[13px] text-[#6b7280] whitespace-nowrap">총 연습</p>
            <p className="font-black text-[30px] text-[#1a1a1a] whitespace-nowrap">12회</p>
          </div>
          <div className="flex flex-col gap-[6px]">
            <p className="font-medium text-[13px] text-[#6b7280] whitespace-nowrap">실전 발표</p>
            <p className="font-black text-[30px] text-[#1a1a1a] whitespace-nowrap">3회</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[16px] items-start w-full">
        <div className="flex gap-[10px] items-baseline whitespace-nowrap">
          <p className="font-bold text-[17px] text-[#1a1a1a]">질문 유형별 답변 정확도</p>
          <p className="font-normal text-[13px] text-[#6b7280]">연습 12회 누적</p>
        </div>
        <div className="flex flex-col gap-[13px] items-start w-full max-w-[840px]">
          {accuracyByType.map((d) => {
            const isWeak = d.type === weakestType.type;
            return (
              <div key={d.type} className="flex gap-[16px] items-center w-full">
                <p className={`text-[15px] w-[84px] ${isWeak ? 'font-bold text-[#f26b1d]' : 'font-medium text-[#6b7280]'}`}>
                  {d.type}
                </p>
                <div className={`flex flex-1 h-[12px] overflow-hidden rounded-[6px] ${isWeak ? 'bg-[#fff3eb]' : 'bg-[#f3f4f6]'}`}>
                  <div
                    className={`h-[12px] rounded-[6px] ${isWeak ? 'bg-[#f26b1d]' : 'bg-[#1a1a1a]'}`}
                    style={{ width: `${d.value}%` }}
                  />
                </div>
                <p className={`text-[17px] text-right w-[56px] ${isWeak ? 'font-black text-[#f26b1d]' : 'font-bold text-[#1a1a1a]'}`}>
                  {d.value}%
                </p>
                {isWeak && (
                  <span className="border border-[#f26b1d] px-[10px] py-[5px] rounded-[6px] shrink-0">
                    <span className="font-bold text-[12px] text-[#f26b1d] whitespace-nowrap">가장 약한 유형</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-bold text-[17px] text-[#1a1a1a] w-full">자주 놓치는 근거</p>
        <div className="flex flex-col items-start w-full">
          <div className="border-b border-[#e5e7eb] flex gap-[20px] items-center pb-[10px] px-[4px] w-full text-[13px] font-bold text-[#6b7280]">
            <p className="w-[280px] text-center">발표 이름</p>
            <p className="w-[80px] text-center">슬라이드</p>
            <p className="flex-1 text-center">놓친 내용</p>
            <p className="w-[120px] text-center">놓친 횟수</p>
          </div>
          {frequentlyMissed.map((m, i) => (
            <div key={`${m.page}-${i}`} className="border-b border-[#e5e7eb] flex gap-[20px] items-center px-[4px] py-[14px] w-full">
              <p className="font-medium text-[16px] text-[#1a1a1a] text-center w-[280px]">{m.presentation}</p>
              <p className="font-bold text-[16px] text-[#1a1a1a] text-center w-[80px]">p.{m.page}</p>
              <p className="flex-1 font-medium text-[16px] text-[#1a1a1a] text-center">{m.content}</p>
              <p className="font-bold text-[16px] text-[#1a1a1a] text-center w-[120px]">
                {m.totalCount}번 중 {m.missedCount}번
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[12px] items-start w-full">
        <p className="font-bold text-[17px] text-[#1a1a1a] w-full">발표 기록</p>
        <div className="flex flex-col items-start w-full">
          <div className="border-b border-[#e5e7eb] flex gap-[18px] items-center pb-[10px] px-[4px] w-full text-[13px] font-bold text-[#6b7280]">
            <span className="w-[72px]" />
            <p className="flex-1">발표 이름</p>
            <p className="w-[100px] text-center">날짜</p>
            <p className="w-[80px] text-center">연습</p>
            <p className="w-[100px] text-center">실전 질문</p>
            <p className="w-[90px] text-center">적중률</p>
            <p className="w-[100px] text-center">리포트</p>
          </div>
          {historyRecords.map((h) => (
            <div key={h.id} className="border-b border-[#e5e7eb] flex gap-[18px] items-center px-[4px] py-[12px] w-full">
              <span className="bg-white border border-[#e6e6e6] rounded-[6px] shrink-0 h-[41px] w-[72px]" />
              <p className="flex-1 font-bold text-[16px] text-[#1a1a1a]">{h.name}</p>
              <p className="font-medium text-[15px] text-[#6b7280] text-center w-[100px]">{h.date}</p>
              <p className="font-medium text-[16px] text-[#1a1a1a] text-center w-[80px]">{h.practiceCount}회</p>
              <p className="font-medium text-[16px] text-[#1a1a1a] text-center w-[100px]">{h.liveQuestions}개</p>
              <p className="font-black text-[18px] text-[#1a1a1a] text-center w-[90px]">{h.hitRate}%</p>
              <button
                type="button"
                onClick={onOpenReport}
                className="font-bold text-[15px] text-[#1a1a1a] text-right underline w-[100px]"
              >
                리포트 보기
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
