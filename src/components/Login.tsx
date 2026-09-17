interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center bg-[#F7F7F7] px-10 py-16">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
          </div>
          <div className="space-y-3 p-5">
            <div className="flex h-40 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">
              슬라이드 캡처 자리
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-bold text-orange-500">예상 질문 · p.4 근거</p>
              <p className="mt-1 text-sm font-medium text-gray-800">이 데이터의 출처는 어디인가요?</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-10 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-black text-gray-900">
            Ready-<span className="text-orange-500">Q</span>
          </h1>
          <p className="mt-3 text-base text-gray-500">질문이 두렵지 않게, 근거는 Ready-Q가</p>

          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              구글로 계속하기
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 text-sm font-semibold text-gray-900 hover:brightness-95"
            >
              카카오로 계속하기
            </button>
          </div>

          <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">
            계속하면 이용약관, 개인정보처리방침에 동의하는 것으로 간주합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
