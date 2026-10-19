import React from 'react';
import {
  AlertTriangle,
  User,
} from 'lucide-react';
import { useNanivio } from '../context/NanivioContext';
import { SUPPORTED_LANGUAGES } from '../types';
import { NanivioLogo } from './common/NanivioLogo';
import { LangpretationIcon } from './common/LangpretationIcon';
import { PWAInstallButton } from './common/PWAInstallButton';

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    myLanguage,
    setIsLanguageModalOpen,
    globalLangpretationEnabled,
    setGlobalLangpretationEnabled,
    adminFeatures,
    currentUser,
  } = useNanivio();

  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#e3ebe4] shadow-[0_4px_20px_rgba(29,73,47,0.035)]">
      {/* Maintenance Mode Alert Banner if active */}
      {adminFeatures.maintenanceMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-900 flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span>System Maintenance Mode Active — Some commercial routes may experience queueing.</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[68px] gap-3">
          {/* Brand Logo & Identity */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 group text-left focus:outline-none cursor-pointer"
              title="Nanivio Home — Connects me with the world"
            >
              <NanivioLogo size="md" showTagline={false} />
              <span className="text-[10px] font-bold tracking-[.12em] px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 hidden xs:inline-block">
                CONNECTED
              </span>
            </button>
          </div>

          {/* Right Action Controls: PWA Install, Language Selector, Langpretation Switch & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Native App Install Button */}
            <PWAInstallButton compact={true} />

            {/* Consumer-Facing "My Language" Selector Pill */}
            <button
              id="btn-select-my-language"
              onClick={() => setIsLanguageModalOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl bg-[#f6faf7] border border-[#e1ebe3] hover:border-emerald-300 text-xs text-[#294a38] transition-all hover:bg-emerald-50 shadow-sm cursor-pointer"
              title="Change your consumer My Language setting"
            >
              <span className="text-sm sm:text-base leading-none">{currentLangObj.flag}</span>
              <div className="text-left hidden sm:block">
                <div className="text-[10px] text-[#809087] leading-none">Language</div>
                <div className="text-xs font-semibold text-[#294a38] leading-tight">{currentLangObj.name}</div>
              </div>
            </button>

            {/* Signature Langpretation Switch */}
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50/80 border border-emerald-100">
              <LangpretationIcon size={18} glow={globalLangpretationEnabled} />
              <span className="text-[11px] font-semibold text-[#52675b] hidden md:inline">Langpretation</span>
              <button
                id="toggle-global-langpretation"
                onClick={() => setGlobalLangpretationEnabled(!globalLangpretationEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  globalLangpretationEnabled ? 'bg-emerald-600 shadow-sm' : 'bg-[#bdc9c0]'
                }`}
                title="Toggle real-time Langpretation"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    globalLangpretationEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* User Profile Quick Pill */}
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'account'
                   ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                   : 'bg-white text-[#53675b] border-[#e1e9e2] hover:border-emerald-300'
              }`}
              title="My Account"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px]">
                {currentUser?.initials || <User className="w-3.5 h-3.5" />}
              </div>
              <span className="hidden sm:inline font-medium text-[#294a38] max-w-[100px] truncate">
                {currentUser?.name?.split(' ')[0] || 'Account'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
