import { useState, type ReactNode } from 'react';
import type { ScreenName } from '../types/flow';
import { ChevronDownIcon, ClockIcon, DocumentIcon, LogoutIcon, MicSmallIcon, SettingsIcon } from './icons';
import { useTheme } from '../theme';

interface HeaderProps {
  compact?: boolean;
  label?: string;
  listening?: boolean;
  rightText?: string;
  rightButtons?: ReactNode;
  showProfile?: boolean;
  activeMenu?: 'history' | 'library' | 'settings';
  onNavigate: (screen: ScreenName) => void;
  cueKey?: number; // 바뀔 때마다 아래 슬레이트 줄무늬가 한 칸 밀린다 (새 질문 신호)
  dark?: boolean; // 시작 화면(검은 무대)용
  guest?: boolean; // 로그인 전(랜딩). 프로필 대신 로그인 버튼을 보여준다
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
  cueKey,
  dark,
  guest = false,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // 화면이 따로 정해주지 않으면 지금 테마를 따른다 (기본은 검은 무대, 설정에서 라이트로 바꾸면 흰 헤더).
  const { theme } = useTheme();
  const isDark = dark ?? theme === 'dark';

  return (
    <div className="w-full shrink-0">
    <header
      className={`flex items-center justify-between px-[28px] w-full ${compact ? 'h-[56px]' : 'h-[60px]'} ${
        isDark ? 'bg-[#0b0907]' : 'bg-white'
      }`}
    >
      <div className="flex gap-[14px] items-center">
        <button
          type="button"
          onClick={() => onNavigate('start')}
          className={`logo font-display tracking-[1.5px] whitespace-nowrap leading-none pt-[3px] ${isDark ? 'text-white' : 'text-[#111111]'} ${
            compact ? 'text-[26px]' : 'text-[28px]'
          }`}
        >
          READY-<span className="logo-q text-[#f26b1d]">Q</span>
        </button>
        {(label || listening) && (
          <>
            <div className="bg-[#e5e7eb] h-[16px] w-px" />
            {listening ? (
              // 마이크가 켜져 있으면 촬영장의 ON AIR 표시등처럼
              <div className="flex gap-[7px] items-center bg-[#e5322d] rounded-full pl-[9px] pr-[11px] h-[26px]">
                <span className="tally-pulse bg-white rounded-full size-[8px]" />
                <span className="font-mono font-bold text-[12px] tracking-[1.5px] text-white whitespace-nowrap">ON AIR</span>
                <span className="size-[14px] text-white">
                  <MicSmallIcon />
                </span>
              </div>
            ) : (
              <p className={`font-medium text-[14px] whitespace-nowrap ${isDark ? 'text-white/55' : 'text-[#6b7280]'}`}>{label}</p>
            )}
          </>
        )}
      </div>

      <div className={`flex gap-[14px] items-center ${isDark ? 'hdr-dark' : ''}`}>
        {rightButtons}
        {rightText && (
          <p className={`font-bold text-[13px] whitespace-nowrap ${isDark ? 'text-white/55' : 'text-[#6b7280]'}`}>{rightText}</p>
        )}
        {guest && (
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="cta bg-[#f26b1d] hover:bg-[#e25c10] h-[36px] px-[16px] rounded-[8px] font-bold text-[14px] text-white"
          >
            로그인
          </button>
        )}
        {showProfile && !guest && (
          <>
            {rightText && <div className="bg-[#e5e7eb] h-[18px] w-px" />}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`border flex gap-[9px] h-[38px] items-center pl-[6px] pr-[10px] rounded-[6px] ${
                  isDark ? 'border-white/20' : 'border-[#e5e7eb]'
                }`}
              >
                <span className="bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center rounded-full size-[26px]">
                  <span className="font-bold text-[11px] text-[#6b7280]">사</span>
                </span>
                <span className={`font-bold text-[14px] whitespace-nowrap ${isDark ? 'text-white' : 'text-[#1a1a1a]'}`}>사용자</span>
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
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate('library');
                    }}
                    className={`flex gap-[10px] h-[40px] items-center px-[11px] rounded-[6px] ${
                      activeMenu === 'library' ? 'bg-[#fff3eb]' : ''
                    }`}
                  >
                    <span className={`size-[17px] ${activeMenu === 'library' ? 'text-[#f26b1d]' : 'text-[#1a1a1a]'}`}>
                      <DocumentIcon />
                    </span>
                    <span
                      className={`text-[14px] whitespace-nowrap ${
                        activeMenu === 'library' ? 'font-bold text-[#f26b1d]' : 'font-medium text-[#1a1a1a]'
                      }`}
                    >
                      자료 보관함
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
    {/* 슬레이트 줄무늬. 새 질문(cueKey)이 오면 한 칸 밀린다 */}
    <div key={cueKey} className={`slate-stripes h-[6px] w-full ${cueKey ? 'slate-sweep' : ''}`} />
    </div>
  );
}
