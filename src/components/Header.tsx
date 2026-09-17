import { useState, type ReactNode } from 'react';
import type { ScreenName } from '../types/flow';

interface HeaderProps {
  presentationName?: string;
  statusText?: string;
  showProfile?: boolean;
  activeMenu?: 'history' | 'settings';
  onNavigate: (screen: ScreenName) => void;
  rightSlot?: ReactNode;
}

export function Header({
  presentationName,
  statusText,
  showProfile = true,
  activeMenu,
  onNavigate,
  rightSlot,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onNavigate('start')}
            className="text-xl font-black tracking-tight text-gray-900"
          >
            Ready-<span className="text-orange-500">Q</span>
          </button>
          {presentationName && (
            <>
              <span className="h-5 w-px bg-gray-300" />
              <span className="text-sm font-medium text-gray-700">{presentationName}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {rightSlot}
          {statusText && <span className="text-sm font-medium text-gray-500">{statusText}</span>}
          {showProfile && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-orange-500">
                  사
                </span>
                <span className="text-sm font-medium text-gray-800">사용자</span>
                <svg
                  className={`h-4 w-4 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('myHistory');
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                      activeMenu === 'history' ? 'font-bold text-orange-500' : 'text-gray-700'
                    }`}
                  >
                    내 기록
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('settings');
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                      activeMenu === 'settings' ? 'font-bold text-orange-500' : 'text-gray-700'
                    }`}
                  >
                    설정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('login');
                    }}
                    className="block w-full border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
