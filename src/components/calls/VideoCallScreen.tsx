import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Shield,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Phone,
  Users,
  MoreHorizontal,
  RefreshCw,
  Smartphone,
  Monitor,
  Check,
  Send,
  X,
  Radio,
  Sparkles,
  Play,
  Square,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SUPPORTED_LANGUAGES } from '../../types';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { NanivioLogo } from '../common/NanivioLogo';
import { LiveCallVideoStage } from './LiveCallVideoStage';
import { speechService } from '../../services/speechService';
import { NanivioTranslatorEngine } from '../../lib/translator-engine/engine';
import type { Participant } from '../../types';

interface VideoCallScreenProps {
  onEndCall: () => void;
}

export const VideoCallScreen: React.FC<VideoCallScreenProps> = ({ onEndCall }) => {
  const {
    activeCall,
    toggleCallLangpretation,
    toggleCallMute,
    toggleCallVideo,
    myLanguage,
    setMyLanguage,
    currentUser,
    sendMessage,
    inCallNotice,
    dismissInCallNotice,
    currentPlan,
    billingSummary,
    wallets,
    simulateSpeakerUtterance,
    langpretationMeter,
    adminFeatures,
  } = useNanivio();

  // Participant resolution
  const host = activeCall?.host || currentUser;
  const remoteParticipant: Participant =
    activeCall?.participants.find((p) => p.id !== host.id) ||
    activeCall?.participants[1] || {
      id: 'usr_remote',
      nvId: '0486000000',
      name: 'Nanivio Contact',
      avatar: '',
      initials: 'NC',
      myLanguage: 'en',
      role: 'user',
    };

  // Language info helpers
  const hostLang = SUPPORTED_LANGUAGES.find((l) => l.code === (host.myLanguage || myLanguage)) || SUPPORTED_LANGUAGES[0];
  const remoteLang = SUPPORTED_LANGUAGES.find((l) => l.code === remoteParticipant.myLanguage) || SUPPORTED_LANGUAGES[3];

  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isPiPSwapped, setIsPiPSwapped] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [langpretationStage, setLangpretationStage] = useState<'listening' | 'interpreting' | 'speaking'>('listening');
  const [activeTab, setActiveTab] = useState<'chats' | 'calls' | 'tap_pad' | 'contacts' | 'more'>('calls');
  const [waveHeights, setWaveHeights] = useState<number[]>([30, 50, 75, 40, 60, 85, 55, 45, 70, 50, 80, 35]);
  const [viewMode, setViewMode] = useState<'immersive' | 'mobile'>('immersive');
  const [videoChatInput, setVideoChatInput] = useState('');

  // Subtitle translations state - clean without hardcoded strings; activated on real voice signal
  const [currentSpokenSubtitle, setCurrentSpokenSubtitle] = useState<string>('');
  const [currentTranslatedSubtitle, setCurrentTranslatedSubtitle] = useState<string>('');
  const [isVoiceSignalActive, setIsVoiceSignalActive] = useState<boolean>(false);

  // Live Speech-to-Text (STT) and Speech Synthesis (TTS) State
  const [isListeningToSpeech, setIsListeningToSpeech] = useState<boolean>(false);
  const [autoVocalize, setAutoVocalize] = useState<boolean>(true);
  const [showQuickPhrases, setShowQuickPhrases] = useState<boolean>(false);
  const [speechStatus, setSpeechStatus] = useState<string>('');

  // Stop STT / TTS on unmount
  useEffect(() => {
    return () => {
      speechService.stopListening();
      speechService.stopSpeaking();
      speechService.stopAudioVisualizer();
    };
  }, []);

  // Keep transcript updated when activeCall currentTranscript changes
  useEffect(() => {
    if (activeCall?.currentTranscript && activeCall.currentTranscript.textInReceiverLang) {
      setCurrentTranslatedSubtitle(activeCall.currentTranscript.textInReceiverLang);
      setCurrentSpokenSubtitle(activeCall.currentTranscript.textInSpeakerLang || '');
      setLangpretationStage('speaking');
      setIsVoiceSignalActive(true);

      if (autoVocalize) {
        speechService.speak(
          activeCall.currentTranscript.textInReceiverLang,
          hostLang.code
        );
      }
    }
  }, [activeCall?.currentTranscript, autoVocalize, hostLang.code]);

  // Toggle Live Microphone Speech Recognition
  const toggleSpeechRecognition = async () => {
    if (isListeningToSpeech) {
      speechService.stopListening();
      speechService.stopAudioVisualizer();
      setIsListeningToSpeech(false);
      setSpeechStatus('');
    } else {
      setSpeechStatus('Listening to your mic...');
      setIsListeningToSpeech(true);

      // Start live audio visualizer reacting to real volume
      speechService.startAudioVisualizer((vol) => {
        if (vol > 12) {
          setIsVoiceSignalActive(true);
          setWaveHeights((prev) =>
            prev.map(() => Math.min(100, Math.max(25, vol + Math.floor(Math.random() * 25))))
          );
        }
      });

      const started = await speechService.startListening(
        hostLang.code,
        async ({ transcript, isFinal }) => {
          setCurrentSpokenSubtitle(transcript);
          setLangpretationStage('interpreting');
          setIsVoiceSignalActive(true);

          if (isFinal && transcript.trim()) {
            setSpeechStatus('Langpretating...');
            const engine = NanivioTranslatorEngine.getInstance();
            const res = await engine.translateText(transcript, hostLang.code, remoteLang.code);
            setCurrentTranslatedSubtitle(res.translatedText);
            setLangpretationStage('speaking');
            setSpeechStatus('');

            if (autoVocalize) {
              speechService.speak(res.translatedText, remoteLang.code);
            }

            simulateSpeakerUtterance(host.id, transcript);
          }
        },
        () => {
          setSpeechStatus('Mic active (Speak clearly)');
        }
      );

      if (!started) {
        setIsListeningToSpeech(false);
        setSpeechStatus('Mic unsupported or denied');
      }
    }
  };

  // Trigger simulated utterance with translation & TTS
  const handleQuickUtterance = async (phraseText: string, langCode: string) => {
    setCurrentSpokenSubtitle(phraseText);
    setLangpretationStage('interpreting');
    setIsVoiceSignalActive(true);

    const engine = NanivioTranslatorEngine.getInstance();
    const res = await engine.translateText(phraseText, langCode, remoteLang.code);
    setCurrentTranslatedSubtitle(res.translatedText);
    setLangpretationStage('speaking');

    if (autoVocalize) {
      speechService.speak(res.translatedText, remoteLang.code);
    }

    simulateSpeakerUtterance(host.id, phraseText);
    setShowQuickPhrases(false);
  };

  // Audio waveform animation loop + voice signal activation
  useEffect(() => {
    const waveInterval = setInterval(() => {
      setWaveHeights((prev) =>
        prev.map(() => Math.floor(Math.random() * 70) + 30)
      );
    }, 120);

    return () => {
      clearInterval(waveInterval);
    };
  }, []);

  // Format call duration
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isMuted = host.isMuted ?? false;
  const isCameraOff = host.isCameraOff ?? false;
  const isLangpretationOn = activeCall?.langpretationEnabled ?? true;
  const durationSeconds = activeCall?.durationSeconds ?? 0;
  const isRemoteSpeaking = activeCall?.activeSpeakerId === remoteParticipant.id || isVoiceSignalActive;

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] text-white flex items-center justify-center p-0 overflow-hidden font-sans select-none animate-in fade-in duration-300">
      
      {/* ------------------------------------------------------------- */}
      {/* CALL STAGE WRAPPER: Occupies at least 90% of screen */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`relative w-full transition-all duration-300 ${
          viewMode === 'mobile'
            ? 'max-w-[440px] h-full sm:h-[95vh] max-h-screen sm:rounded-[44px] sm:border-[6px] sm:border-[#1a2333] shadow-[0_0_90px_rgba(0,0,0,0.95)]'
            : 'w-full h-full max-h-screen'
        } bg-[#040812] overflow-hidden flex flex-col`}
      >
        {/* ============================================================= */}
        {/* 1. TOP STATUS & CALL CONTROLS HEADER */}
        {/* ============================================================= */}
        <div className="absolute top-0 inset-x-0 z-30 pt-3 px-4 sm:px-6 pb-4 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent">
          {/* Left: Call Timer + Recording + Live Signal Status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono shadow-md">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-white font-bold">{formatTime(durationSeconds)}</span>
              <div className="flex items-end gap-0.5 h-3 ml-1">
                <span className="w-0.5 h-1.5 bg-emerald-400 rounded-full" />
                <span className="w-0.5 h-2 bg-emerald-400 rounded-full" />
                <span className="w-0.5 h-3 bg-emerald-400 rounded-full" />
              </div>
            </div>

            {/* Remote Participant Identity Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs">
              <span className="text-slate-400">Calling:</span>
              <span className="font-semibold text-white truncate max-w-[140px]">
                {remoteParticipant.name}
              </span>
              <span className="text-xs">{remoteLang.flag}</span>
            </div>

            {/* Live Langpretation Meter / Service Value pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/70 border border-emerald-500/30 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {langpretationMeter && langpretationMeter.remainingAllowance > 0 ? (
                <span className="text-emerald-300 font-semibold">
                  Live Meter: {langpretationMeter.remainingAllowance.toFixed(1)}m remaining
                </span>
              ) : currentPlan.langpretationMinutesRemaining > 0 ? (
                <span className="text-emerald-300 font-semibold">
                  {currentPlan.langpretationMinutesRemaining}m included
                </span>
              ) : (
                <span className="text-amber-300 font-semibold">
                  Value: GH₵ {(billingSummary?.communicationAccount?.balance ?? (wallets?.find((w) => w.currency === 'GHS')?.amount ?? 0.0)).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Center: Nanivio Brand Logo */}
          <div className="flex items-center">
            <NanivioLogo size="sm" showTagline={false} />
          </div>

          {/* Right: View Mode Toggle, Security Shield & Swap Feeds */}
          <div className="flex items-center gap-2">
            {/* View Mode Toggle (Expanded / Mobile) */}
            <button
              onClick={() => setViewMode(viewMode === 'immersive' ? 'mobile' : 'immersive')}
              className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15 hover:border-white/30 text-white/80 hover:text-white flex items-center gap-1.5 text-xs transition-colors shadow-sm"
              title={viewMode === 'immersive' ? 'Switch to Phone View' : 'Switch to Full View'}
            >
              {viewMode === 'immersive' ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline text-[11px] font-medium">Phone View</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden md:inline text-[11px] font-medium">Full View</span>
                </>
              )}
            </button>

            {/* End-to-End Encryption Badge */}
            <button
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              title="End-to-End Encrypted Live WebRTC Call"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            </button>

            {/* Swap Feeds Button */}
            <button
              onClick={() => setIsPiPSwapped(!isPiPSwapped)}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              title="Swap main and picture-in-picture video"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* In-Call Langpretation Notice Banner (Only shown if admin approved call minute warnings) */}
        {inCallNotice && adminFeatures?.callMinutesWarningApproved && (
          <div className="absolute top-16 inset-x-4 z-30 max-w-md mx-auto pointer-events-auto">
            <div
              className={`p-3 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center justify-between gap-3 text-xs ${
                inCallNotice.type === 'exhausted'
                  ? 'bg-rose-950/90 border-rose-500/60 text-rose-200'
                  : inCallNotice.type === 'fallback'
                  ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                  : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {inCallNotice.type === 'exhausted' ? '⚠️' : inCallNotice.type === 'fallback' ? '🔄' : '⏱️'}
                </span>
                <span className="font-semibold leading-tight">{inCallNotice.message}</span>
              </div>
              <button
                onClick={dismissInCallNotice}
                className="p-1 hover:bg-white/10 rounded-lg text-white/70 hover:text-white shrink-0 cursor-pointer"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* 2. MAIN IMMERSIVE VIDEO STAGE */}
        {/* ============================================================= */}
        <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col justify-end">
          <LiveCallVideoStage
            localParticipant={host}
            remoteParticipant={remoteParticipant}
            isLocalCameraOff={isCameraOff}
            isLocalMuted={isMuted}
            isRemoteSpeaking={isRemoteSpeaking}
            activeSpeakerText={currentSpokenSubtitle}
            isPiPSwapped={isPiPSwapped}
            onTogglePiPSwap={() => setIsPiPSwapped(!isPiPSwapped)}
            isCompactMode={viewMode === 'mobile'}
          />

          {/* ============================================================= */}
          {/* 3. FLOATING IN-CALL ACTION CONTROLS */}
          {/* ============================================================= */}
          <div className="absolute bottom-2.5 inset-x-0 z-20 px-3 flex flex-col items-center pointer-events-auto">
            <div className="flex items-center justify-center gap-2.5 sm:gap-4 w-full max-w-[390px] px-3 py-2 rounded-2xl bg-black/75 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
              
              {/* Button 1: Speaker */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-speaker"
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${
                    isSpeakerOn
                      ? 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                      : 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                  }`}
                  title={isSpeakerOn ? 'Speaker On' : 'Speaker Muted'}
                >
                  {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
                <span className="text-[10px] sm:text-[11px] text-white/90 font-medium">Speaker</span>
              </div>

              {/* Button 2: Mute Mic */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-mute"
                  onClick={toggleCallMute}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${
                    isMuted
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50 scale-105'
                      : 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <span className="text-[10px] sm:text-[11px] text-white/90 font-medium">
                  {isMuted ? 'Muted' : 'Mute'}
                </span>
              </div>

              {/* Button 3: Video Camera Toggle */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-camera"
                  onClick={toggleCallVideo}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-xl border ${
                    isCameraOff
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50 scale-105'
                      : 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                  }`}
                  title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                </button>
                <span className="text-[10px] sm:text-[11px] text-white/90 font-medium">
                  {isCameraOff ? 'Cam Off' : 'Camera'}
                </span>
              </div>

              {/* Button 4: Langpretation Signature Icon */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-langpretation"
                  onClick={toggleCallLangpretation}
                  className="relative hover:scale-105 active:scale-95 transition-transform"
                  title="Toggle Langpretation Real-Time Translation"
                >
                  <LangpretationIcon size={46} glow={isLangpretationOn} />
                </button>
                <span className="text-[10px] sm:text-[11px] text-white/90 font-medium">Langpretation</span>
              </div>

              {/* Button 5: End Call (Red) */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-end"
                  onClick={onEndCall}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#ef4444] hover:bg-rose-600 text-white flex items-center justify-center shadow-[0_4px_24px_rgba(239,68,68,0.7)] hover:scale-105 active:scale-95 transition-all"
                  title="End Live Call Session"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <span className="text-[10px] sm:text-[11px] text-rose-400 font-bold">End Call</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* 4. LANGPRETATION LIVE SUBTITLE & SPEECH-TO-SPEECH BAR */}
        {/* ============================================================= */}
        <div className="relative z-30 px-3.5 sm:px-6 py-2 bg-[#070b14]/95 border-t border-slate-800/80 backdrop-blur-md">
          <div className="rounded-2xl bg-[#0b1322] border border-[#1a273f] p-3 shadow-xl space-y-2">
              {/* Top Indicator Line */}
              <div className="flex items-center justify-between">
                {/* Left: Langpretation Status + Stage */}
                <div className="flex items-center gap-1.5">
                  <LangpretationIcon size={20} glow={isLangpretationOn} />
                  <div className="flex items-center gap-1 text-[10px] sm:text-xs font-bold tracking-tight">
                    <span className="text-white">LANGPRETATION</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isLangpretationOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                      }`}
                    />
                    <span className={isLangpretationOn ? 'text-emerald-400' : 'text-slate-500'}>
                      {isLangpretationOn ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {/* Call Assist Stage Indicator */}
                  {isLangpretationOn && (
                    <span className="ml-1 px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 text-[9px] font-mono border border-cyan-500/20 flex items-center gap-0.5">
                      {isRemoteSpeaking ? '🔊 Live Audio' : '🎧 Listening'}
                    </span>
                  )}
                </div>

                {/* Center: Language Pair Pill with dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[10px] sm:text-xs text-slate-200 font-medium transition-colors"
                    title="Change translation language pair"
                  >
                    <span>{hostLang.flag}</span>
                    <span className="font-semibold text-white">{hostLang.name}</span>
                    <span className="text-slate-400 font-mono">⇄</span>
                    <span className="font-semibold text-white">{remoteLang.name}</span>
                    <span>{remoteLang.flag}</span>
                  </button>

                  {/* Language Picker Dropdown */}
                  {showLanguagePicker && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl z-40 max-h-56 overflow-y-auto">
                      <div className="text-[10px] text-slate-400 uppercase font-mono px-2 py-1">
                        Choose Your Language
                      </div>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => {
                            setMyLanguage(lang.code);
                            setShowLanguagePicker(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                            myLanguage === lang.code
                              ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                          </span>
                          {myLanguage === lang.code && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Live STT Mic, Auto-Vocalize TTS, and Quick Phrases */}
                <div className="flex items-center gap-1.5">
                  {/* Real Microphone STT Button */}
                  <button
                    onClick={toggleSpeechRecognition}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono transition-all cursor-pointer ${
                      isListeningToSpeech
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 animate-pulse'
                        : 'bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                    title={isListeningToSpeech ? 'Click to stop live microphone STT' : 'Speak into real microphone to translate'}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{isListeningToSpeech ? 'Live Mic ON' : 'Talk Mic'}</span>
                  </button>

                  {/* Auto-Vocalize TTS Toggle */}
                  <button
                    onClick={() => {
                      const next = !autoVocalize;
                      setAutoVocalize(next);
                      if (!next) speechService.stopSpeaking();
                    }}
                    className={`p-1 rounded-full transition-colors ${
                      autoVocalize ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-500'
                    }`}
                    title={autoVocalize ? 'Text-to-Speech (TTS) enabled' : 'Text-to-Speech (TTS) muted'}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Quick African Phrases Dropdown Toggle */}
                  <button
                    onClick={() => setShowQuickPhrases(!showQuickPhrases)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-mono cursor-pointer"
                    title="Test spoken phrases in Akan, Swahili, Yoruba, French"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span className="hidden sm:inline">Phrases</span>
                  </button>

                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold font-mono">
                    HD
                  </span>
                </div>
              </div>

              {/* Quick Phrases Testing Drawer */}
              {showQuickPhrases && (
                <div className="pt-2 pb-1 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-left animate-in fade-in">
                  <div className="text-[10px] text-slate-400 font-mono col-span-full flex items-center justify-between">
                    <span>Quick Spoken Phrase Simulation (Click to Speak & Translate):</span>
                    <button onClick={() => setShowQuickPhrases(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
                  </div>
                  <button
                    onClick={() => handleQuickUtterance('Akwaaba! Wo ho te sɛn?', 'ak')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/50 border border-slate-800 hover:border-emerald-500/40 text-left text-xs transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">🇬🇭 Akan: <em>Akwaaba! Wo ho te sɛn?</em></span>
                    <Play className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                  </button>
                  <button
                    onClick={() => handleQuickUtterance('Hujambo! Habari za leo rafiki yangu?', 'sw')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/50 border border-slate-800 hover:border-emerald-500/40 text-left text-xs transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">🇰🇪 Swahili: <em>Hujambo! Habari za leo?</em></span>
                    <Play className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                  </button>
                  <button
                    onClick={() => handleQuickUtterance('Bawo ni nkan? Mo n reti ipe re.', 'yo')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/50 border border-slate-800 hover:border-emerald-500/40 text-left text-xs transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">🇳🇬 Yoruba: <em>Bawo ni nkan?</em></span>
                    <Play className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                  </button>
                  <button
                    onClick={() => handleQuickUtterance('Bonjour! Ravi de vous parler sur Nanivio.', 'fr')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/50 border border-slate-800 hover:border-emerald-500/40 text-left text-xs transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">🇫🇷 French: <em>Bonjour! Ravi de vous parler.</em></span>
                    <Play className="w-3 h-3 text-emerald-400 shrink-0 ml-1" />
                  </button>
                </div>
              )}

              {/* Bottom Subtitle Line & Dynamic Audio Waveform */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <div className="flex flex-col gap-0.5 truncate max-w-[80%]">
                  {currentSpokenSubtitle && (
                    <div className="text-[10px] text-slate-400 truncate flex items-center gap-1.5">
                      <span className="text-emerald-400/80 font-mono">Original:</span>
                      <span className="italic truncate">"{currentSpokenSubtitle}"</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[11px] font-bold text-[#10b981] shrink-0 font-mono">
                      {hostLang.name}:
                    </span>
                    <span className="text-xs sm:text-[13px] text-white font-medium truncate">
                      {currentTranslatedSubtitle || (speechStatus || (isRemoteSpeaking ? 'Translating live voice stream...' : 'Listening on live channel...'))}
                    </span>
                  </div>
                </div>

                {/* Dynamic Green Voice Signal Waveform Bars */}
                <div className="flex items-center gap-[2.5px] h-4 shrink-0 pl-2">
                  {waveHeights.map((h, i) => (
                    <span
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`w-[2.5px] rounded-full transition-all duration-100 ${
                        isListeningToSpeech ? 'bg-cyan-400' : 'bg-[#10b981]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

        {/* IN-CALL LIVE CHAT OVERLAY (WHEN TAB CHATS SELECTED) */}
        {activeTab === 'chats' && (
          <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-88 bg-slate-950/95 border-l border-slate-800 backdrop-blur-xl flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">In-Call Video Chat</span>
              </div>
              <button
                onClick={() => setActiveTab('calls')}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-[11px] leading-relaxed">
                💬 Live chat messages will be instantly translated into {remoteParticipant.name}'s preferred language.
              </div>

              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
                  <span className="font-bold text-white block mb-0.5">{remoteParticipant.name}</span>
                  <span>Video call connected. Can you hear me clearly?</span>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2">
              <input
                type="text"
                value={videoChatInput}
                onChange={(e) => setVideoChatInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && videoChatInput.trim()) {
                    const txt = videoChatInput;
                    setVideoChatInput('');
                    await sendMessage(txt);
                  }
                }}
                placeholder="Type in-call chat message..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={async () => {
                  if (videoChatInput.trim()) {
                    const txt = videoChatInput;
                    setVideoChatInput('');
                    await sendMessage(txt);
                  }
                }}
                disabled={!videoChatInput.trim()}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* 6. BOTTOM NAVIGATION TABS */}
        {/* ============================================================= */}
        <div className="relative z-30 pt-1 pb-3 px-4 sm:px-6 bg-[#050912] border-t border-slate-800/80 flex items-center justify-between text-center">
          
          {/* Tab 1: Chats */}
          <button
            id="nav-tab-chats"
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center relative transition-colors ${
              activeTab === 'chats' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-1 font-medium">Chats</span>
          </button>

          {/* Tab 2: Calls */}
          <button
            id="nav-tab-calls"
            onClick={() => setActiveTab('calls')}
            className={`flex flex-col items-center transition-colors ${
              activeTab === 'calls' ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] mt-1 font-bold text-emerald-400">In Call</span>
          </button>

          {/* Tab 3: Center Elevated Button - Langpretation Tap Pad */}
          <div className="relative -top-2 flex flex-col items-center">
            <button
              id="nav-tab-tap-pad"
              onClick={() => {
                setActiveTab('tap_pad');
                setIsVoiceSignalActive(true);
                setLangpretationStage('speaking');
              }}
              className="hover:scale-110 active:scale-95 transition-all shadow-lg"
              title="Test Langpretation Utterance"
            >
              <LangpretationIcon size={52} glow={true} />
            </button>
            <span className="text-[9px] text-white/80 font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Langpretation Tap
            </span>
          </div>

          {/* Tab 4: Contacts */}
          <button
            id="nav-tab-contacts"
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center transition-colors ${
              activeTab === 'contacts' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1 font-medium">Contacts</span>
          </button>

          {/* Tab 5: More */}
          <button
            id="nav-tab-more"
            onClick={() => setActiveTab('more')}
            className={`flex flex-col items-center relative transition-colors ${
              activeTab === 'more' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-1 font-medium">More</span>
          </button>
        </div>
      </div>
    </div>
  );
};
