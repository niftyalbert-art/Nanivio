import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MessageSquare,
  MoreHorizontal,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  Monitor,
  Check,
  Send,
  X,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SUPPORTED_LANGUAGES } from '../../types';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { NanivioLogo } from '../common/NanivioLogo';
import { LiveCallVideoStage } from './LiveCallVideoStage';
import { formatBillingAmount } from '../../lib/billingPresentation';
import { speechService } from '../../services/speechService';
import { NanivioTranslatorEngine } from '../../lib/translator-engine/engine';
import { agoraClient } from '../../lib/agoraClient';

interface VideoCallScreenProps {
  onEndCall: () => void;
}

export const VideoCallScreen: React.FC<VideoCallScreenProps> = ({ onEndCall }) => {
  const {
    activeCall,
    messages,
    activeConversationId,
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
    processLiveSpeechUtterance,
    langpretationMeter,
    adminFeatures,
    agoraStats,
  } = useNanivio();

  // Participant resolution
  const isAudioCall = activeCall?.type === 'audio_1on1' || activeCall?.type === 'group_audio';
  const host = activeCall?.participants.find(p=>p.id===currentUser.id)
    || (activeCall?.host.id===currentUser.id?activeCall.host:currentUser);
  const remoteParticipant = activeCall?.participants.find((p) => p.id !== host.id) || null;
  const hasRemoteParticipant = remoteParticipant !== null;

  // Language info helpers
  const hostLang = SUPPORTED_LANGUAGES.find((l) => l.code === (host.myLanguage || myLanguage)) || SUPPORTED_LANGUAGES[0];
  const remoteLang = remoteParticipant
    ? SUPPORTED_LANGUAGES.find((l) => l.code === remoteParticipant.myLanguage) || null
    : null;

  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isPiPSwapped, setIsPiPSwapped] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [langpretationStage, setLangpretationStage] = useState<'listening' | 'interpreting' | 'speaking'>('listening');
  const [activeTab, setActiveTab] = useState<'chats' | 'calls'>('calls');
  const [viewMode, setViewMode] = useState<'immersive' | 'mobile'>('immersive');
  const [videoChatInput, setVideoChatInput] = useState('');
  const [isVideoChatSending, setIsVideoChatSending] = useState(false);
  const [videoChatError, setVideoChatError] = useState<string | null>(null);
  const [showCallMore, setShowCallMore] = useState(false);
  const [dismissedMediaError, setDismissedMediaError] = useState<string | null>(null);
  const callMoreRef = useRef<HTMLDivElement | null>(null);
  const languagePickerRef = useRef<HTMLDivElement | null>(null);

  // Subtitle translations state - clean without hardcoded strings; activated on real voice signal
  const [currentSpokenSubtitle, setCurrentSpokenSubtitle] = useState<string>('');
  const [currentTranslatedSubtitle, setCurrentTranslatedSubtitle] = useState<string>('');

  // Live Speech-to-Text (STT) and Speech Synthesis (TTS) State
  const [isListeningToSpeech, setIsListeningToSpeech] = useState<boolean>(false);
  const [autoVocalize, setAutoVocalize] = useState<boolean>(true);
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

      const started = await speechService.startListening(
        hostLang.code,
        async ({ transcript, isFinal }) => {
          setCurrentSpokenSubtitle(transcript);
          setLangpretationStage('interpreting');

          if (isFinal && transcript.trim()) {
            setSpeechStatus('Langpretating...');
            try{
              await processLiveSpeechUtterance(host.id, transcript);
              setLangpretationStage('speaking');setSpeechStatus('');
            }catch{setSpeechStatus('Translation unavailable.');setLangpretationStage('listening');}
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

  // Production Langpretation is driven by real microphone audio/ASR.
  // No canned/demo utterance generator is available in production.

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
  const isRemoteSpeaking = !!remoteParticipant && activeCall?.activeSpeakerId === remoteParticipant.id;
  const inCallMessages = activeConversationId ? (messages[activeConversationId] || []) : [];
  const isMediaConnected = activeCall?.status === 'connected' && !!agoraStats?.hasRemoteMedia;
  const callConnectionLabel = (() => {
    switch (activeCall?.status) {
      case 'ringing':
        return 'Ringing';
      case 'calling':
        return 'Calling';
      case 'connecting':
        return 'Connecting';
      case 'ended':
        return 'Call ended';
      case 'connected':
        if (agoraStats?.hasRemoteMedia) return 'Remote media connected';
        if (agoraStats?.hasLocalMedia) return 'Local media ready · waiting for remote media';
        return 'Waiting for remote media';
      default:
        return 'Call status unavailable';
    }
  })();
  const showMediaError = !!activeCall?.mediaError && activeCall.mediaError !== dismissedMediaError;

  useEffect(() => {
    setDismissedMediaError(null);
    setIsSpeakerOn(true);
    agoraClient.setRemoteAudioMuted(false);
  }, [activeCall?.id]);

  useEffect(() => {
    if (!showCallMore && !showLanguagePicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!callMoreRef.current?.contains(target)) setShowCallMore(false);
      if (!languagePickerRef.current?.contains(target)) setShowLanguagePicker(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCallMore(false);
        setShowLanguagePicker(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showCallMore, showLanguagePicker]);

  const handleToggleSpeaker = () => {
    const nextSpeakerOn = !isSpeakerOn;
    agoraClient.setRemoteAudioMuted(!nextSpeakerOn);
    setIsSpeakerOn(nextSpeakerOn);
  };

  const handleInCallSend = async () => {
    if (!videoChatInput.trim() || isVideoChatSending || !activeConversationId) return;
    const text = videoChatInput;
    setIsVideoChatSending(true);
    setVideoChatError(null);
    try {
      await sendMessage(text);
      setVideoChatInput('');
    } catch {
      setVideoChatError('Message not sent. Your draft is still here—try again.');
    } finally {
      setIsVideoChatSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111814] text-white flex items-center justify-center p-0 overflow-hidden font-sans select-none animate-in fade-in duration-200">
      
      {/* ------------------------------------------------------------- */}
      {/* CALL STAGE WRAPPER: Occupies at least 90% of screen */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`relative w-full transition-all duration-300 ${
          viewMode === 'mobile'
            ? 'max-w-[440px] h-full sm:h-[95vh] max-h-screen sm:rounded-[44px] sm:border-[6px] sm:border-[#1a2333] shadow-[0_0_90px_rgba(0,0,0,0.95)]'
            : 'w-full h-full max-h-screen'
          } bg-[#111814] overflow-hidden flex flex-col`}
      >
        {/* ============================================================= */}
        {/* 1. TOP STATUS & CALL CONTROLS HEADER */}
        {/* ============================================================= */}
        <div className="absolute top-0 inset-x-0 z-30 pt-3 px-4 sm:px-6 pb-4 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent">
          {/* Left: Call Timer + Recording + Live Signal Status */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              role="status"
              aria-live="polite"
              title={callConnectionLabel}
              className="flex min-w-0 max-w-[45vw] items-center gap-1.5 rounded-full border border-white/15 bg-[#1d2822] px-2.5 py-1 text-[10px] font-semibold text-white sm:max-w-[260px] sm:text-xs"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agoraStats?.hasRemoteMedia ? 'bg-[#e5b84e]' : 'bg-white/55'}`} />
              <span className="truncate">{callConnectionLabel}</span>
            </div>

            {/* Remote Participant Identity Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700/60 text-xs">
                <span className="text-slate-400">{remoteParticipant ? 'Calling:' : 'Waiting for participant'}</span>
              <span className="font-semibold text-white truncate max-w-[140px]">
                  {remoteParticipant?.name || ''}
              </span>
            </div>

            {/* Live Langpretation Meter / Nanivio credit pill */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/70 border border-emerald-500/30 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {langpretationMeter && langpretationMeter.remainingAllowance > 0 ? (
                <span className="text-emerald-300 font-semibold">
                  Live Meter: {formatBillingAmount(langpretationMeter?.remainingAllowance)}m remaining
                </span>
              ) : currentPlan.langpretationMinutesRemaining > 0 ? (
                <span className="text-emerald-300 font-semibold">
                  {currentPlan.langpretationMinutesRemaining}m included
                </span>
              ) : (
                <span className="text-amber-300 font-semibold">
                  Value: GH₵ {formatBillingAmount(billingSummary?.communicationAccount?.balance ?? wallets?.find((w) => w.currency === 'GHS')?.amount)}
                </span>
              )}
            </div>
          </div>

          {/* Center: Nanivio Brand Logo */}
          <div className="flex items-center">
            <NanivioLogo size="sm" showTagline={false} />
          </div>

          {/* Secondary call view actions are kept together under More. */}
          <div className="relative" ref={callMoreRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={showCallMore}
              onClick={() => setShowCallMore((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#1d2822] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2a3930]"
            >
              <MoreHorizontal className="h-4 w-4" /> More
            </button>
            {showCallMore && (
              <div role="menu" aria-label="More call actions" className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/20 bg-[#1d2822] p-1.5 shadow-xl">
                <button type="button" role="menuitem" onClick={() => { setViewMode(viewMode === 'immersive' ? 'mobile' : 'immersive'); setShowCallMore(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-white hover:bg-white/10">
                  {viewMode === 'immersive' ? <Smartphone className="h-4 w-4 text-[#e5b84e]" /> : <Monitor className="h-4 w-4 text-[#e5b84e]" />}
                  {viewMode === 'immersive' ? 'Switch to phone view' : 'Switch to full view'}
                </button>
                <button type="button" role="menuitem" onClick={() => { setIsPiPSwapped((swapped) => !swapped); setShowCallMore(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-white hover:bg-white/10">
                  <RefreshCw className="h-4 w-4 text-[#e5b84e]" /> Swap video tiles
                </button>
              </div>
            )}
          </div>
        </div>

        {showMediaError && activeCall?.mediaError && (
          <div className="absolute top-[4.5rem] inset-x-3 sm:inset-x-6 z-50 mx-auto max-w-xl">
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-[#d98b72] bg-[#38231f] p-3 text-sm text-[#ffddd1] shadow-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1aa8e]" />
                <p className="min-w-0 break-words">{activeCall.mediaError}</p>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDismissedMediaError(activeCall.mediaError || null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#ffddd1] hover:bg-white/10"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={onEndCall}
                  className="rounded-lg bg-[#c85846] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#d96754]"
                >
                  End call
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-Call Langpretation Notice Banner (Only shown if admin approved call minute warnings) */}
        {inCallNotice && adminFeatures?.callMinutesWarningApproved && (
          <div className={`absolute ${showMediaError ? 'top-[8.5rem]' : 'top-16'} inset-x-4 z-30 max-w-md mx-auto pointer-events-auto`}>
            <div
              className={`p-3 rounded-2xl border shadow-xl flex items-center justify-between gap-3 text-xs ${
                inCallNotice.type === 'exhausted'
                  ? 'bg-rose-950/90 border-rose-500/60 text-rose-200'
                  : inCallNotice.type === 'fallback'
                  ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                  : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
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
          {activeCall?.status === 'ended' ? (
            <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#18211c] px-8 text-center">
              <div>
                <p className="text-lg font-semibold text-white">Call ended</p>
                <p className="mt-1 text-sm text-white/55">You can close this call screen.</p>
              </div>
            </div>
          ) : remoteParticipant && agoraStats?.hasRemoteMedia ? (
            <LiveCallVideoStage
              localParticipant={host}
              remoteParticipant={remoteParticipant}
              isLocalCameraOff={isAudioCall || isCameraOff}
              audioOnly={isAudioCall}
              isLocalMuted={isMuted}
              isRemoteSpeaking={isRemoteSpeaking}
              activeSpeakerText={currentSpokenSubtitle}
              isPiPSwapped={isPiPSwapped}
              onTogglePiPSwap={() => setIsPiPSwapped(!isPiPSwapped)}
              isCompactMode={viewMode === 'mobile'}
            />
          ) : (
            <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#18211c] px-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-white/15 bg-white/5 flex items-center justify-center">
                  <VideoIcon className="h-5 w-5 text-[#e5b84e]" />
                </div>
                <p className="text-lg font-semibold text-white">
                  {activeCall?.status === 'ringing' || activeCall?.status === 'calling'
                    ? callConnectionLabel
                    : remoteParticipant
                    ? 'Waiting for remote media'
                    : 'Waiting for a participant'}
                </p>
                <p className="mt-1 text-sm text-white/55">
                  {agoraStats?.hasLocalMedia ? 'Local media is ready.' : 'Local media is not available yet.'}
                  {remoteParticipant && !agoraStats?.hasRemoteMedia ? ' Remote video will appear when media is available.' : ''}
                </p>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* 3. FLOATING IN-CALL ACTION CONTROLS */}
          {/* ============================================================= */}
          <div className="absolute bottom-2.5 inset-x-0 z-20 px-3 flex flex-col items-center pointer-events-auto">
            <div className="flex items-center justify-center gap-1 sm:gap-4 w-full max-w-[520px] px-1 sm:px-3 py-2 rounded-2xl bg-[#111814]/95 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
              
              {/* Button 1: Speaker */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-speaker"
                  type="button"
                  aria-label={isSpeakerOn ? 'Mute remote audio' : 'Unmute remote audio'}
                  onClick={handleToggleSpeaker}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                    isSpeakerOn
                      ? 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                      : 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                  }`}
                  title={isSpeakerOn ? 'Speaker On' : 'Speaker Muted'}
                >
                  {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
                <span className="hidden text-[10px] sm:block sm:text-[11px] text-white/90 font-medium">Speaker</span>
              </div>

              {/* Button 2: Mute Mic */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-mute"
                  type="button"
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  onClick={toggleCallMute}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                    isMuted
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50 scale-105'
                      : 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <span className="hidden text-[10px] sm:block sm:text-[11px] text-white/90 font-medium">
                  {isMuted ? 'Muted' : 'Mute'}
                </span>
              </div>

              {/* Button 3: Video Camera Toggle */}
              <div className={isAudioCall ? 'hidden' : 'flex flex-col items-center gap-1'}>
                <button
                  id="call-action-camera"
                  type="button"
                  aria-label={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                  onClick={toggleCallVideo}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                    isCameraOff
                      ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50 scale-105'
                      : 'bg-slate-800/90 text-white border-white/20 hover:bg-slate-700'
                  }`}
                  title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isCameraOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                </button>
                <span className="hidden text-[10px] sm:block sm:text-[11px] text-white/90 font-medium">
                  {isCameraOff ? 'Cam Off' : 'Camera'}
                </span>
              </div>

              {/* Button 4: Langpretation Signature Icon */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-langpretation"
                  type="button"
                  aria-label={isLangpretationOn ? 'Turn Langpretation off' : 'Turn Langpretation on'}
                  onClick={toggleCallLangpretation}
                  className="relative hover:scale-105 active:scale-95 transition-transform"
                  title="Toggle Langpretation Real-Time Translation"
                >
                  <LangpretationIcon size={46} glow={isLangpretationOn} />
                </button>
                <span className="hidden text-[10px] sm:block sm:text-[11px] text-white/90 font-medium">Langpretation</span>
              </div>

              {/* Button 5: End Call (Red) */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="call-action-end"
                  type="button"
                  aria-label="End call"
                  onClick={onEndCall}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#ef4444] hover:bg-rose-600 text-white flex items-center justify-center shadow-[0_4px_24px_rgba(239,68,68,0.7)] hover:scale-105 active:scale-95 transition-all"
                  title="End Live Call Session"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
                <span className="hidden text-[10px] sm:block sm:text-[11px] text-rose-400 font-bold">End Call</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* 4. LANGPRETATION LIVE SUBTITLE & SPEECH-TO-SPEECH BAR */}
        {/* ============================================================= */}
        <div className="relative z-30 px-3.5 sm:px-6 py-1.5 bg-[#18211c] border-t border-white/10">
          <div className="rounded-xl bg-[#202c24] border border-white/10 px-3 py-2 space-y-1">
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
                      {isListeningToSpeech ? 'Mic on' : 'Ready'}
                    </span>
                  )}
                </div>

                {/* Center: Language Pair Pill with dropdown */}
                <div className="relative" ref={languagePickerRef}>
                  <button
                    onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[10px] sm:text-xs text-slate-200 font-medium transition-colors"
                    title="Change translation language pair"
                  >
                    <span className="font-mono text-[9px] uppercase">{hostLang.code}</span>
                    <span className="font-semibold text-white">{hostLang.name}</span>
                    <span className="text-slate-400 font-mono">to</span>
                    {remoteLang ? (
                      <>
                        <span className="font-semibold text-white">{remoteLang.name}</span>
                        <span className="font-mono text-[9px] uppercase">{remoteLang.code}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">{hasRemoteParticipant ? 'Language not set' : 'Waiting for participant'}</span>
                    )}
                  </button>

                  {/* Language Picker Dropdown */}
                  {showLanguagePicker && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl z-40 max-h-[min(14rem,40dvh)] overflow-y-auto">
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
                            <span className="w-7 font-mono text-[9px] uppercase">{lang.code}</span>
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

                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold font-mono">
                    HD
                  </span>
                </div>
              </div>

              {/* Compact translated-caption strip; no synthetic audio meter. */}
              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800/80">
                <div className="flex flex-col gap-0.5 truncate flex-1 min-w-0">
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
                      {currentTranslatedSubtitle || speechStatus || (isListeningToSpeech ? 'Listening for speech…' : 'No translation received yet.')}
                    </span>
                  </div>
                </div>

                <span className="hidden sm:block shrink-0 font-mono text-[10px] text-white/60">
                  {hostLang.code.toUpperCase()} {remoteLang ? `→ ${remoteLang.code.toUpperCase()}` : ''}
                </span>
              </div>
            </div>
          </div>

        {/* IN-CALL LIVE CHAT OVERLAY (WHEN TAB CHATS SELECTED) */}
        {activeTab === 'chats' && (
          <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-96 bg-[#17211b] border-l border-white/15 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">In-call chat</span>
              </div>
              <button
                onClick={() => setActiveTab('calls')}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              {!activeConversationId ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/65">
                  Open a conversation in Chat to use in-call messaging.
                </p>
              ) : inCallMessages.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/65">No messages in this conversation yet.</p>
              ) : inCallMessages.map((message) => (
                <div key={message.id} className={`flex ${message.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 ${message.senderId === currentUser.id ? 'bg-[#174e3c] text-white' : 'bg-[#26332b] text-white/90'}`}>
                    {message.senderId !== currentUser.id && <span className="mb-1 block text-[10px] font-semibold text-[#e5b84e]">{message.senderName}</span>}
                    <p className="whitespace-pre-wrap break-words">{message.text || (message.voiceNote ? 'Voice note' : 'Attachment')}</p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void handleInCallSend(); }} className="p-3 border-t border-white/10 bg-[#1d2822]">
              <div className="flex items-center gap-2">
              <input
                type="text"
                value={videoChatInput}
                onChange={(e) => setVideoChatInput(e.target.value)}
                placeholder={activeConversationId ? 'Write a message…' : 'Choose a chat first'}
                disabled={!activeConversationId || isVideoChatSending}
                className="flex-1 bg-[#111814] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#e5b84e] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!activeConversationId || !videoChatInput.trim() || isVideoChatSending}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#dda82d] px-3 text-xs font-bold text-[#18231f] disabled:opacity-45"
              >
                <Send className="w-3.5 h-3.5" />
                {isVideoChatSending ? 'Sending' : 'Send'}
              </button>
              </div>
              {videoChatError && <p role="alert" className="pt-1 text-[11px] text-[#ffb6a4]">{videoChatError}</p>}
            </form>
          </div>
        )}

        {/* ============================================================= */}
        {/* 6. BOTTOM NAVIGATION TABS */}
        {/* ============================================================= */}
        <div className="relative z-30 px-4 py-2 bg-[#18211c] border-t border-white/10 flex items-center justify-between">
          <button
            id="nav-tab-chats"
            onClick={() => setActiveTab('chats')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${activeTab === 'chats' ? 'bg-white/10 text-white' : 'text-white/65 hover:text-white'}`}
          >
            <MessageSquare className="h-4 w-4" /> Chat
          </button>
          {isMediaConnected
            ? <span className="text-[10px] font-mono text-white/45">{formatTime(durationSeconds)}</span>
            : <span title={callConnectionLabel} className="max-w-[38vw] truncate text-[10px] font-mono text-white/45">{callConnectionLabel}</span>}
          <span className="hidden text-[10px] font-mono uppercase tracking-widest text-white/45 sm:inline">Call controls above</span>
        </div>
      </div>
    </div>
  );
};
