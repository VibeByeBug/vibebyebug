import { useState, type ReactNode } from 'react';
import type { ScreenName } from '../types/flow';
import { ChevronDownIcon, ClockIcon, LogoutIcon, MicSmallIcon, SettingsIcon } from './icons';

interface HeaderProps {
  compact?: boolean;
  label?: string;
  listening?: boolean;
  rightText?: string;
  rightButtons?: ReactNode;
  showProfile?: boolean;
  activeMenu?: 'history' | 'settings';
  onNavigate: (screen: ScreenName) => void;
}

export function Header({
  compact = false,
  label,
  listening = false,
  rightText,
  rightButtons,
  showProfile = true,
  activeMenu,
  onNavigate,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={`border-b border-[#e5e7eb] flex items-center justify-between px-[28px] w-full shrink-0 ${
        compact ? 'h-[56px]' : 'h-[60px]'
      }`}
    >
      <div className="flex gap-[14px] items-center">
        <button
          type="button"
          onClick={() => onNavigate('start')}
          className={`font-['Noto_Sans_KR'] font-black tracking-[-0.54px] text-[#1a1a1a] whitespace-nowrap ${
            compact ? 'text-[18px]' : 'text-[19px]'
          }`}
        >
          Ready-<span className="text-[#f26b1d]">Q</span>
        </button>
        {(label || listening) && (
          <>
            <div className="bg-[#e5e7eb] h-[16px] w-px" />
            {listening ? (
              <div className="flex gap-[7px] items-center">
                <span className="size-[16px] text-[#1a1a1a]">
                  <MicSmallIcon />
                </span>
                <p className="font-bold text-[13px] text-[#1a1a1a] whitespace-nowrap">듣는 중</p>
              </div>
            ) : (
              <p className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">{label}</p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-[14px] items-center">
        {rightButtons}
        {rightText && <p className="font-bold text-[13px] text-[#6b7280] whitespace-nowrap">{rightText}</p>}
        {showProfile && (
          <>
            {rightText && <div className="bg-[#e5e7eb] h-[18px] w-px" />}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="border border-[#e5e7eb] flex gap-[9px] h-[38px] items-center pl-[6px] pr-[10px] rounded-[6px]"
              >
                <span className="bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center rounded-full size-[26px]">
                  <span className="font-bold text-[11px] text-[#6b7280]">사</span>
                </span>
                <span className="font-bold text-[14px] text-[#1a1a1a] whitespace-nowrap">사용자</span>
                <span className={`size-[14px] text-[#6b7280] transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                  <ChevronDownIcon />
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 bg-white border border-[#e5e7eb] flex flex-col p-[5px] rounded-[6px] top-[46px] w-[180px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('myHistory');
                    }}
                    className={`flex gap-[10px] h-[40px] items-center px-[11px] rounded-[6px] ${
                      activeMenu === 'history' ? 'bg-[#fff3eb]' : ''
                    }`}
                  >
                    <span className={`size-[17px] ${activeMenu === 'history' ? 'text-[#f26b1d]' : 'text-[#1a1a1a]'}`}>
                      <ClockIcon />
                    </span>
                    <span
                      className={`text-[14px] whitespace-nowrap ${
                        activeMenu === 'history' ? 'font-bold text-[#f26b1d]' : 'font-medium text-[#1a1a1a]'
                      }`}
                    >
                      내 기록
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('settings');
                    }}
                    className={`flex gap-[10px] h-[40px] items-center px-[11px] rounded-[6px] ${
                      activeMenu === 'settings' ? 'bg-[#fff3eb]' : ''
                    }`}
                  >
                    <span className={`size-[17px] ${activeMenu === 'settings' ? 'text-[#f26b1d]' : 'text-[#1a1a1a]'}`}>
                      <SettingsIcon />
                    </span>
                    <span
                      className={`text-[14px] whitespace-nowrap ${
                        activeMenu === 'settings' ? 'font-bold text-[#f26b1d]' : 'font-medium text-[#1a1a1a]'
                      }`}
                    >
                      설정
                    </span>
                  </button>
                  <div className="bg-[#e5e7eb] h-px w-full" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('login');
                    }}
                    className="flex gap-[10px] h-[40px] items-center px-[11px] rounded-[6px]"
                  >
                    <span className="size-[17px] text-[#6b7280]">
                      <LogoutIcon />
                    </span>
                    <span className="font-medium text-[14px] text-[#6b7280] whitespace-nowrap">로그아웃</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
