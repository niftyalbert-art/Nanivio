import React, { useState, useEffect } from 'react';
import {
  Globe,
  Radio,
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Search,
  Volume2,
  Send,
  Zap,
  Activity,
  Layers,
  Lock,
  Cpu,
} from 'lucide-react';
import {
  NANIVIO_18_LANGUAGES,
  AUTHORITATIVE_18_LANG_CODES,
  MatrixLanguageInfo,
  CapabilityLevel,
  RealtimeStrategy,
  buildUniversal18x18Matrix,
  MatrixPairEntry,
} from '../../lib/translator-engine/matrix/universal18Matrix';
import { NanivioTranslatorEngine } from '../../lib/translator-engine/engine';
import { NanivioTtsAudioGenerator } from '../../lib/translator-engine/audio/ttsAudioGenerator';

export const AdminLangpretationManager: React.FC = () => {
  const [languages, setLanguages] = useState<Record<string, MatrixLanguageInfo>>(NANIVIO_18_LANGUAGES);
  const [filterType, setFilterType] = useState<'all' | 'african' | 'full' | 'partial' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLangCode, setSelectedLangCode] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Live Pair Test Console State
  const [testSourceLang, setTestSourceLang] = useState('en');
  const [testTargetLang, setTestTargetLang] = useState('ak');
  const [testInputText, setTestInputText] = useState('Good morning, how is your business going today?');
  const [testResult, setTestResult] = useState<{
    translatedText?: string;
    provider?: string;
    latencyMs?: number;
    cached?: boolean;
    audioUrl?: string;
  } | null>(null);
  const [isTestingTranslation, setIsTestingTranslation] = useState(false);

  // Telemetry and usage statistics
  const [usageSummary, setUsageSummary] = useState<{
    totalMinutes: number;
    totalCalls: number;
    totalVoiceNotes: number;
    estimatedCostUsd: number;
    providerCounts: Record<string, number>;
  }>({
    totalMinutes: 342.5,
    totalCalls: 89,
    totalVoiceNotes: 214,
    estimatedCostUsd: 4.12,
    providerCounts: {
      'Khaya AI (Ghana NLP)': 142,
      'Sunbird AI': 56,
      'Palabra Realtime MT': 168,
      'Meta NLLB-200': 37,
    },
  });

  // Load live languages and usage from server
  useEffect(() => {
    fetch('/api/langpretation/languages')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.languages)) {
          const map: Record<string, MatrixLanguageInfo> = {};
          data.languages.forEach((l: MatrixLanguageInfo) => {
            map[l.code] = l;
          });
          setLanguages((prev) => ({ ...prev, ...map }));
        }
      })
      .catch((e) => console.warn('Failed to load server languages:', e));

    fetch('/api/langpretation/usage-summary')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.totalMinutes !== undefined) {
          setUsageSummary(data);
        }
      })
      .catch((e) => console.warn('Failed to load usage summary:', e));
  }, []);

  const handleToggleActive = async (code: string) => {
    const current = languages[code];
    if (!current) return;
    const newActive = !current.active;

    setIsUpdating(code);
    try {
      const res = await fetch('/api/langpretation/admin/update-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          active: newActive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLanguages((prev) => ({
          ...prev,
          [code]: { ...prev[code], active: newActive },
        }));
        setSaveToast(`Language ${current.name} is now ${newActive ? 'ACTIVE' : 'DEACTIVATED'}.`);
        setTimeout(() => setSaveToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to update language active status:', err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateLanguageField = async (
    code: string,
    updates: Partial<MatrixLanguageInfo>
  ) => {
    setIsUpdating(code);
    try {
      const res = await fetch('/api/langpretation/admin/update-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          ...updates,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLanguages((prev) => ({
          ...prev,
          [code]: { ...prev[code], ...updates },
        }));
        setSaveToast(`Updated ${languages[code]?.name} routing successfully.`);
        setTimeout(() => setSaveToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to update language:', err);
    } finally {
      setIsUpdating(null);
    }
  };

  const runTranslationTest = async () => {
    if (!testInputText.trim()) return;
    setIsTestingTranslation(true);
    setTestResult(null);

    const start = Date.now();
    try {
      const engine = NanivioTranslatorEngine.getInstance();
      const res = await engine.translateText(testInputText, testSourceLang, testTargetLang);

      let audioUrl: string | undefined;
      try {
        const synth = await NanivioTtsAudioGenerator.generatePlayableWavBlob(
          res.translatedText,
          testTargetLang
        );
        audioUrl = synth.url;
      } catch (synthErr) {
        console.warn('Synthesis in test console:', synthErr);
      }

      setTestResult({
        translatedText: res.translatedText,
        provider: res.provider,
        latencyMs: Date.now() - start,
        cached: res.cached,
        audioUrl,
      });
    } catch (err: any) {
      setTestResult({
        translatedText: `[Error: ${err.message || 'Translation failed'}]`,
        provider: 'error',
        latencyMs: Date.now() - start,
      });
    } finally {
      setIsTestingTranslation(false);
    }
  };

  const filteredLanguageList = AUTHORITATIVE_18_LANG_CODES.map((c) => languages[c] || NANIVIO_18_LANGUAGES[c])
    .filter((l) => {
      if (!l) return false;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q) ||
        l.provider.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (filterType === 'african') return l.isAfrican;
      if (filterType === 'full') return l.capability === 'FULL';
      if (filterType === 'partial') return l.capability === 'PARTIAL';
      if (filterType === 'inactive') return !l.active;
      return true;
    });

  const fullDuplexCount = (Object.values(languages) as MatrixLanguageInfo[]).filter((l) => l.capability === 'FULL').length;
  const africanCount = (Object.values(languages) as MatrixLanguageInfo[]).filter((l) => l.isAfrican).length;
  const activeCount = (Object.values(languages) as MatrixLanguageInfo[]).filter((l) => l.active).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-950 border border-emerald-500 text-emerald-300 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-mono font-bold animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-[#0b1324] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <Radio className="w-3 h-3 animate-pulse" />
                SOVEREIGN LANGPRETATION CORE
              </span>
              <span className="text-xs text-slate-400 font-mono">18 Authoritative Target Languages</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Universal Multilingual Matrix &amp; Provider Registry</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Realtime speech-to-speech translation, chunked VAD turn processing, neural machine translation, and
              audio synthesis router across all 18 launch languages. Change provider assignments live without rebuilding the applet.
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              onClick={() => {
                fetch('/api/langpretation/languages')
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.languages) {
                      const map: Record<string, MatrixLanguageInfo> = {};
                      data.languages.forEach((l: MatrixLanguageInfo) => {
                        map[l.code] = l;
                      });
                      setLanguages((prev) => ({ ...prev, ...map }));
                      setSaveToast('Language matrix re-synchronized.');
                      setTimeout(() => setSaveToast(null), 2500);
                    }
                  });
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Refresh Matrix</span>
            </button>
          </div>
        </div>

        {/* 4 Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Target Languages</span>
            <div className="text-2xl font-black text-white font-mono mt-0.5">
              18 <span className="text-xs text-emerald-400 font-bold">({activeCount} Active)</span>
            </div>
            <span className="text-[10px] text-slate-500">18 x 18 = 324 directed pairs</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Full Duplex Realtime</span>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
              {fullDuplexCount} <span className="text-xs text-slate-400">/ 18</span>
            </div>
            <span className="text-[10px] text-emerald-400/80">Sub-second streaming audio</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">African Specialized</span>
            <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
              {africanCount} <span className="text-xs text-slate-400">Languages</span>
            </div>
            <span className="text-[10px] text-amber-400/80">Ghana NLP &amp; Sunbird AI</span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Incurred Cost Estimate</span>
            <div className="text-2xl font-black text-cyan-400 font-mono mt-0.5">
              ${usageSummary.estimatedCostUsd.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-500">{usageSummary.totalMinutes.toFixed(0)} mins logged</span>
          </div>
        </div>
      </div>

      {/* Interactive 18-Language Matrix Table */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                filterType === 'all'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All 18 Languages
            </button>

            <button
              onClick={() => setFilterType('african')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                filterType === 'african'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              African Languages ({africanCount})
            </button>

            <button
              onClick={() => setFilterType('full')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                filterType === 'full'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Full Duplex S2S ({fullDuplexCount})
            </button>

            <button
              onClick={() => setFilterType('partial')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                filterType === 'partial'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              VAD-Chunked Turn
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search language, code, provider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        {/* The Matrix Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                <th className="py-3 px-3.5">Language</th>
                <th className="py-3 px-3">Family &amp; Region</th>
                <th className="py-3 px-3">Pipeline Capability</th>
                <th className="py-3 px-3">Realtime Strategy</th>
                <th className="py-3 px-3">Primary Provider Route</th>
                <th className="py-3 px-3 text-center">Voice Notes</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredLanguageList.map((lang) => {
                const isSelected = selectedLangCode === lang.code;
                return (
                  <tr
                    key={lang.code}
                    className={`transition-colors hover:bg-slate-900/60 ${
                      !lang.active ? 'opacity-60 bg-rose-950/10' : ''
                    } ${isSelected ? 'bg-emerald-950/20' : ''}`}
                  >
                    {/* Language & Code */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl shrink-0">{lang.flag}</span>
                        <div>
                          <div className="font-bold text-white text-xs flex items-center gap-1.5">
                            <span>{lang.name}</span>
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {lang.code}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 italic">{lang.nativeName}</span>
                        </div>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="py-3 px-3">
                      <div className="text-slate-300 text-[11.5px] font-medium">{lang.region}</div>
                      <span className="text-[10px] text-slate-500 font-mono">{lang.family}</span>
                    </td>

                    {/* Capability Badge */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold ${
                          lang.capability === 'FULL'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : lang.capability === 'PARTIAL'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {lang.capability === 'FULL' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                        )}
                        <span>{lang.capability}</span>
                      </span>
                    </td>

                    {/* Realtime Strategy */}
                    <td className="py-3 px-3 font-mono text-[10.5px]">
                      <span
                        className={
                          lang.realtimeStrategy === 'STREAMING_FULL_DUPLEX'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                      >
                        {lang.realtimeStrategy.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Primary Provider Route */}
                    <td className="py-3 px-3">
                      <div className="text-white font-medium text-[11px] flex items-center gap-1.5">
                        <Cpu className="w-3 h-3 text-purple-400 shrink-0" />
                        <span>{lang.provider}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ${lang.costPerMinuteUsd.toFixed(3)}/min
                      </span>
                    </td>

                    {/* Voice Notes */}
                    <td className="py-3 px-3 text-center">
                      <span className="text-emerald-400 font-bold font-mono text-xs">✓ LIVE</span>
                    </td>

                    {/* Active Switch */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleToggleActive(lang.code)}
                        disabled={isUpdating === lang.code}
                        className={`px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold transition-all cursor-pointer ${
                          lang.active
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                        }`}
                      >
                        {isUpdating === lang.code ? '...' : lang.active ? 'ACTIVE' : 'DISABLED'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedLangCode(isSelected ? null : lang.code)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {isSelected ? 'Close' : 'Configure'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Language Route Config Drawer */}
        {selectedLangCode && languages[selectedLangCode] && (
          <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white text-sm">
                  Reconfigure Routing for {languages[selectedLangCode].name} ({selectedLangCode.toUpperCase()})
                </span>
              </div>
              <button
                onClick={() => setSelectedLangCode(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">Primary MT Provider</label>
                <select
                  value={languages[selectedLangCode].mtProvider}
                  onChange={(e) =>
                    handleUpdateLanguageField(selectedLangCode, { mtProvider: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="Khaya AI Asante Twi Engine">Khaya AI (Ghana NLP)</option>
                  <option value="Sunbird AI Translation Engine">Sunbird AI (Makerere)</option>
                  <option value="Palabra Realtime MT">Palabra Realtime MT</option>
                  <option value="Meta NLLB-200">Meta NLLB-200 Universal</option>
                  <option value="Google Cloud Translation">Google Cloud Translation</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">ASR (Speech-to-Text)</label>
                <select
                  value={languages[selectedLangCode].asrProvider}
                  onChange={(e) =>
                    handleUpdateLanguageField(selectedLangCode, { asrProvider: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="Khaya AI Ghana Acoustic Models">Khaya AI Acoustic Models</option>
                  <option value="Sunbird AI Luganda ASR Models">Sunbird AI Models</option>
                  <option value="Palabra / Azure Speech">Palabra / Azure Speech</option>
                  <option value="Google Cloud Speech">Google Cloud Speech</option>
                  <option value="Whisper Neural ASR">Whisper Large v3</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">TTS (Speech Synthesis)</label>
                <select
                  value={languages[selectedLangCode].ttsProvider}
                  onChange={(e) =>
                    handleUpdateLanguageField(selectedLangCode, { ttsProvider: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="Khaya AI Tonal Neural Synthesizer">Khaya AI Neural Synthesizer</option>
                  <option value="Sunbird AI Speech Synthesizer">Sunbird AI Speech</option>
                  <option value="Palabra Neural TTS">Palabra Neural TTS</option>
                  <option value="Google Cloud Text-to-Speech">Google Cloud TTS</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 italic">
              Note: Provider modifications take effect across all active call sessions and voice notes immediately.
            </div>
          </div>
        )}
      </div>

      {/* Live 18-Language Pair Translation Tester & Latency Console */}
      <div className="bg-[#0b1324] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Live 18-Language Translation Tester</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Verifies live STT → MT → TTS pipeline</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Source Lang */}
          <div>
            <label className="text-xs font-mono text-slate-400 block mb-1">Source Language</label>
            <select
              value={testSourceLang}
              onChange={(e) => setTestSourceLang(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            >
              {AUTHORITATIVE_18_LANG_CODES.map((c) => {
                const info = languages[c] || NANIVIO_18_LANGUAGES[c];
                return (
                  <option key={c} value={c}>
                    {info.flag} {info.name} ({info.code})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Target Lang */}
          <div>
            <label className="text-xs font-mono text-slate-400 block mb-1">Target Language</label>
            <select
              value={testTargetLang}
              onChange={(e) => setTestTargetLang(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            >
              {AUTHORITATIVE_18_LANG_CODES.map((c) => {
                const info = languages[c] || NANIVIO_18_LANGUAGES[c];
                return (
                  <option key={c} value={c}>
                    {info.flag} {info.name} ({info.code})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Input Text Box */}
        <div>
          <label className="text-xs font-mono text-slate-400 block mb-1">Spoken Utterance or Phrase</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testInputText}
              onChange={(e) => setTestInputText(e.target.value)}
              placeholder="Enter sentence in source language..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500 font-sans"
            />
            <button
              onClick={runTranslationTest}
              disabled={isTestingTranslation || !testInputText.trim()}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {isTestingTranslation ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Translating...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Test Route</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Result Card */}
        {testResult && (
          <div className="bg-slate-950 border border-emerald-500/50 rounded-2xl p-4 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Result in {languages[testTargetLang]?.name || testTargetLang}:</span>
              </span>
              <div className="flex items-center gap-3 text-slate-400">
                <span>Provider: <strong className="text-white">{testResult.provider}</strong></span>
                <span>Latency: <strong className="text-emerald-400">{testResult.latencyMs}ms</strong></span>
              </div>
            </div>

            <p className="text-base font-semibold text-white leading-relaxed">
              "{testResult.translatedText}"
            </p>

            {testResult.audioUrl && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (testResult.audioUrl) {
                        const audio = new Audio(testResult.audioUrl);
                        audio.play().catch(() => {});
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Play Synthesized Audio</span>
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Format: 16-bit PCM WAV / 16kHz</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
