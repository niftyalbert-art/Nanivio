import React from 'react';
import {
  AlertTriangle,
  Home,
  MessageCircle,
  PhoneCall,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { useNanivio } from '../context/NanivioContext';
import { SUPPORTED_LANGUAGES } from '../types';
import { NanivioLogo } from './common/NanivioLogo';
import { LangpretationIcon } from './common/LangpretationIcon';
import { PWAInstallButton } from './common/PWAInstallButton';
import { MalviFloatingWidget } from './malvi/MalviFloatingWidget';

export const Navbar: React.FC<{compact?:boolean}> = ({compact=false}) => {
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

  if(compact)return (
    <header className="nv-chat-toolbar flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#121417] px-3" aria-label="Chat navigation">
      <button type="button" onClick={()=>setActiveTab('home')} className="min-h-11 px-1 text-sm font-semibold text-white" aria-label="Nanivio home">Nanivio</button>
      <div className="nv-reference-pills flex min-w-0 items-center gap-2" aria-label="Conversation settings">
        <button type="button" onClick={()=>setIsLanguageModalOpen(true)} className="min-h-11 px-1 text-xs text-white" aria-label="Select your language">{currentLangObj.flag} <span className="hidden sm:inline">{currentLangObj.name}</span><span className="sm:hidden">{currentLangObj.code.toUpperCase()}</span></button>
        <button id="toggle-global-langpretation" type="button" role="switch" aria-checked={globalLangpretationEnabled} onClick={()=>setGlobalLangpretationEnabled(!globalLangpretationEnabled)} className="min-h-11 rounded-lg border border-white/15 px-2 text-xs text-white">Langpretation {globalLangpretationEnabled?'ON':'OFF'}</button>
        {adminFeatures.malviAiAssistantEnabled&&<MalviFloatingWidget placement="header"/>}
      </div>
    </header>
  );

  const links = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'chat', label: 'Messages', icon: MessageCircle },
    { id: 'calls', label: 'Calls', icon: PhoneCall },
    { id: 'contacts', label: 'Contacts', icon: Users },
    ...(adminFeatures.malviAiAssistantEnabled ? [{ id: 'malvi', label: 'Malvi', icon: Sparkles }] : []),
  ] as const;
  const firstName = currentUser?.name?.trim().split(/\s+/)[0] || 'Account';
  return (
    <header className="nv-glass-header sticky top-0 z-40 shrink-0 border-b border-white/10 bg-[#0b1026]/80 backdrop-blur-xl">
      {adminFeatures.maintenanceMode && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-300/20 bg-amber-400/10 px-4 py-1.5 text-center text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Maintenance in progress</span>
        </div>
      )}
      <div className="nanivio-navbar-inner mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <button type="button" onClick={() => setActiveTab('home')} className="navbar-brand flex shrink-0 items-center" aria-label="Nanivio home">
            <NanivioLogo size="md" showTagline={false} />
          </button>
          <nav className="nv-pill-nav hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`nv-pill-link ${activeTab === id ? 'is-active' : ''}`}
              >
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="navbar-actions flex shrink-0 items-center gap-2">
            <span className="navbar-install"><PWAInstallButton compact={true} /></span>
            <button
              id="btn-select-my-language"
              type="button"
              onClick={() => setIsLanguageModalOpen(true)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white hover:border-cyan-300/50"
              aria-label={`Language: ${currentLangObj.name}`}
            >
              <span aria-hidden="true">{currentLangObj.flag}</span>
              <span className="hidden sm:inline">{currentLangObj.name}</span>
            </button>
            <div className="flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5">
              <LangpretationIcon size={18} glow={globalLangpretationEnabled} />
              <span className="hidden text-xs font-semibold text-slate-200 lg:inline">Langpretation</span>
              <button
                id="toggle-global-langpretation"
                type="button"
                role="switch"
                aria-checked={globalLangpretationEnabled}
                aria-label="Langpretation"
                onClick={() => setGlobalLangpretationEnabled(!globalLangpretationEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${globalLangpretationEnabled ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500' : 'bg-slate-600'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition ${globalLangpretationEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`nv-profile-chip ${activeTab === 'account' ? 'is-active' : ''}`}
              aria-label="My account"
            >
              <span className="nv-profile-chip-avatar">
                {currentUser?.avatar ? <img src={currentUser.avatar} alt="" /> : (currentUser?.initials || <User className="h-4 w-4" />)}
              </span>
              <span className="nv-profile-chip-name hidden xl:inline">{firstName}</span>
            </button>
          </div>
        </div>
        {activeTab === 'chat' && adminFeatures.malviAiAssistantEnabled && (
          <div className="flex justify-end pb-2" data-malvi-chat-dock>
            <MalviFloatingWidget placement="header" />
          </div>
        )}
      </div>
    </header>
  );
};
