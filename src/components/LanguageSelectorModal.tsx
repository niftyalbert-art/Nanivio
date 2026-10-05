import React, { useState } from 'react';
import { X, Search, Check, Globe, Mic, Languages, ShieldCheck } from 'lucide-react';
import { useNanivio } from '../context/NanivioContext';
import { getAllLanguages, LanguageRegistryItem } from '../i18n/languages';

type LanguageTab = 'app' | 'speaking' | 'translation';

export const LanguageSelectorModal: React.FC = () => {
  const {
    isLanguageModalOpen,
    setIsLanguageModalOpen,
    appLanguage,
    setAppLanguage,
    speakingLanguage,
    setSpeakingLanguage,
    translationLanguage,
    setTranslationLanguage,
  } = useNanivio();

  const [activeTab, setActiveTab] = useState<LanguageTab>('app');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isLanguageModalOpen) return null;

  const allLanguages = getAllLanguages();

  const filteredLanguages = allLanguages.filter((lang) => {
    const matchesSearch =
      lang.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.nativeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.region.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lang.code.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'app') return lang.ui;
    if (activeTab === 'speaking') return lang.speechRecognition || lang.voiceTranslation;
    return lang.translation;
  });

  const getSelectedCode = () => {
    if (activeTab === 'app') return appLanguage;
    if (activeTab === 'speaking') return speakingLanguage;
    return translationLanguage;
  };

  const handleSelect = (code: string) => {
    if (activeTab === 'app') {
      setAppLanguage(code);
    } else if (activeTab === 'speaking') {
      setSpeakingLanguage(code);
    } else {
      setTranslationLanguage(code);
    }
  };

  const currentAppLang = allLanguages.find((l) => l.code === appLanguage);
  const currentSpeakingLang = allLanguages.find((l) => l.code === speakingLanguage);
  const currentTranslationLang = allLanguages.find((l) => l.code === translationLanguage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0c1424] border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Nanivio Language Control
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold uppercase tracking-wider">
                  Multi-Channel
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure your interface, spoken voice, and incoming translation languages separately
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsLanguageModalOpen(false)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Triple Channel Status Banner */}
        <div className="bg-slate-950/70 border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className="text-slate-400">Current Setup:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1">
              App: <strong className="text-emerald-400">{currentAppLang?.name || appLanguage}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1">
              Speaking: <strong className="text-cyan-400">{currentSpeakingLang?.name || speakingLanguage}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1">
              Translating: <strong className="text-amber-400">{currentTranslationLang?.name || translationLanguage}</strong>
            </span>
          </div>
        </div>

        {/* Channel Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 p-2 gap-1.5">
          <button
            onClick={() => setActiveTab('app')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'app'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>App Language</span>
          </button>

          <button
            onClick={() => setActiveTab('speaking')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'speaking'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Speaking Voice</span>
          </button>

          <button
            onClick={() => setActiveTab('translation')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'translation'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>Langpretation</span>
          </button>
        </div>

        {/* Tab Description Helper */}
        <div className="px-4 py-2 bg-slate-900/30 text-xs text-slate-400 flex items-center justify-between">
          <span>
            {activeTab === 'app' && 'Menu labels, buttons, navigation, and system notifications will display in this language.'}
            {activeTab === 'speaking' && 'The language you speak during live voice calls and speech-to-text recognition.'}
            {activeTab === 'translation' && 'Incoming calls, voice notes, and messages will automatically translate into this language.'}
          </span>
        </div>

        {/* Search input */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${allLanguages.length}+ international & African languages...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Language List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-1.5 flex-1 divide-y divide-slate-800/40">
          {filteredLanguages.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No matching languages found. Try another search term or code.
            </div>
          ) : (
            filteredLanguages.map((lang) => {
              const isSelected = getSelectedCode() === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                    isSelected
                      ? activeTab === 'app'
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-white'
                        : activeTab === 'speaking'
                        ? 'bg-cyan-500/15 border border-cyan-500/40 text-white'
                        : 'bg-amber-500/15 border border-amber-500/40 text-white'
                      : 'hover:bg-slate-800/50 text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none">{lang.flag}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{lang.name}</span>
                        <span className="text-xs text-slate-400 font-medium">({lang.nativeName})</span>
                        {lang.direction === 'rtl' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                            RTL
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{lang.region}</span>
                        <span className="text-slate-600">•</span>
                        <span className="font-mono text-slate-500">{lang.code.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {lang.voiceTranslation && (
                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 text-[10px] font-medium border border-slate-700">
                        Voice AI
                      </span>
                    )}
                    {isSelected && (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-slate-950 font-bold ${
                          activeTab === 'app'
                            ? 'bg-emerald-400'
                            : activeTab === 'speaking'
                            ? 'bg-cyan-400'
                            : 'bg-amber-400'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info & Done */}
        <div className="p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Preferences saved instantly to device and account</span>
          </div>
          <button
            onClick={() => setIsLanguageModalOpen(false)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
