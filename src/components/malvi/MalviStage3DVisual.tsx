import React from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
  Square,
  FastForward,
  Headphones,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { MalviAvatarState } from '../../types';
import malviImage from '../../assets/images/malvi_avatar.jpg';
import { MalviVoiceWaveform } from './MalviVoiceWaveform';
import { MalviLivingMotionAvatar } from './MalviLivingMotionAvatar';

interface MalviStage3DVisualProps {
  state: MalviAvatarState;
  isListening: boolean;
  isProcessing: boolean;
  currentlySpeakingText: string | null;
  interimTranscript?: string;
  voiceSpeechEnabled: boolean;
  handsFreeMode: boolean;
  speechRate: number;
  onToggleMic: () => void;
  onInterrupt: () => void;
  onToggleVoice: () => void;
  onToggleHandsFree: () => void;
  onChangeSpeechRate: () => void;
  onQuickPrompt?: (text: string) => void;
  immersiveMode?: boolean;
  onToggleImmersive?: () => void;
}

export const MalviStage3DVisual: React.FC<MalviStage3DVisualProps> = ({
  state,
  isListening,
  isProcessing,
  currentlySpeakingText,
  interimTranscript,
  voiceSpeechEnabled,
  handsFreeMode,
  speechRate,
  onToggleMic,
  onInterrupt,
  onToggleVoice,
  onToggleHandsFree,
  onChangeSpeechRate,
  onQuickPrompt,
  immersiveMode = false,
  onToggleImmersive,
}) => {
  const isSpeaking = state === 'speaking' || !!currentlySpeakingText;
  const isThinking = state === 'thinking' || isProcessing;

  // Dynamic status styling
  const getStatusBadge = () => {
    if (isSpeaking) {
      return {
        text: 'Speaking to You',
        bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-cyan-500/20',
        dot: 'bg-cyan-400 animate-ping',
      };
    }
    if (isListening) {
      return {
        text: 'Listening Live...',
        bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-emerald-500/20',
        dot: 'bg-emerald-400 animate-pulse',
      };
    }
    if (isThinking) {
      return {
        text: 'Reasoning & Processing',
        bg: 'bg-purple-500/20 text-purple-300 border-purple-400/50',
        dot: 'bg-purple-400 animate-spin',
      };
    }
    if (state === 'interrupted') {
      return {
        text: 'Paused / Ready',
        bg: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
        dot: 'bg-amber-400',
      };
    }
    return {
      text: 'Online • Ready to Speak',
      bg: 'bg-slate-800/90 text-slate-300 border-slate-700',
      dot: 'bg-emerald-400',
    };
  };

  const status = getStatusBadge();

  return (
    <div
      className={`relative flex flex-col rounded-3xl overflow-hidden border transition-all duration-500 select-none ${
        isSpeaking
          ? 'border-cyan-500/50 shadow-2xl shadow-cyan-500/10'
          : isListening
          ? 'border-emerald-500/50 shadow-2xl shadow-emerald-500/10'
          : isThinking
          ? 'border-purple-500/40 shadow-xl shadow-purple-500/10'
          : 'border-slate-800/90 shadow-xl'
      } bg-gradient-to-b from-[#0e172a] via-[#0b1120] to-[#070b14]`}
    >
      {/* Dynamic 3D Ambient Background Glows */}
      <div
        className={`absolute -top-16 -left-16 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
          isSpeaking
            ? 'bg-cyan-500/25 scale-125'
            : isListening
            ? 'bg-emerald-500/25 scale-125'
            : isThinking
            ? 'bg-purple-500/20'
            : 'bg-cyan-600/10'
        }`}
      />
      <div
        className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
          isSpeaking
            ? 'bg-blue-600/25'
            : isListening
            ? 'bg-teal-500/25'
            : 'bg-slate-800/30'
        }`}
      />

      {/* Top Bar on 3D Stage */}
      <div className="relative z-10 px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-2 backdrop-blur-md bg-slate-950/40">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400 animate-pulse" />
          <span className="text-xs font-black tracking-wider uppercase text-white font-mono flex items-center gap-1.5">
            <span>Malvi 3D Assistant</span>
            <span className="text-[10px] text-cyan-400 font-normal">v2.5</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Status Chip */}
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1.5 backdrop-blur-sm ${status.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span>{status.text}</span>
          </span>

          {/* Immersive View Toggle */}
          {onToggleImmersive && (
            <button
              onClick={onToggleImmersive}
              className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
              title={immersiveMode ? 'Standard Layout' : 'Full Stage Mode'}
            >
              {immersiveMode ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main 3D Visual Stage Frame */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden min-h-[320px] sm:min-h-[380px] md:min-h-[420px]">
        {/* Holographic 3D Depth Backdrop Frame */}
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[4/5] rounded-3xl overflow-hidden p-1 bg-gradient-to-b from-cyan-500/30 via-slate-800/40 to-slate-950 shadow-2xl border border-slate-700/60 group">
          {/* Outer Dynamic Glow Ring */}
          <div
            className={`absolute inset-0 rounded-3xl transition-all duration-700 pointer-events-none ${
              isSpeaking
                ? 'ring-4 ring-cyan-400/60 shadow-[0_0_35px_rgba(6,182,212,0.4)]'
                : isListening
                ? 'ring-4 ring-emerald-400/60 shadow-[0_0_35px_rgba(16,185,129,0.4)]'
                : isThinking
                ? 'ring-4 ring-purple-400/50 shadow-[0_0_25px_rgba(168,85,247,0.3)]'
                : 'ring-1 ring-slate-700/50'
            }`}
          />

          {/* Malvi Living Motion Avatar: Breathing, Blinking, Aim Gaze Tracking, Mouth Speech */}
          <MalviLivingMotionAvatar
            state={state}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isThinking}
          />

          {/* Top Identity Floating Badge */}
          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-500/30 shadow-lg text-[11px] font-bold text-white pointer-events-none">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Malvi • Nanivio</span>
          </div>

            {/* Subtitle / Live Vocal Caption HUD Banner */}
            {(currentlySpeakingText || interimTranscript || isListening) && (
              <div className="absolute bottom-3 inset-x-3 p-3 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-2xl space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    {isSpeaking
                      ? 'Malvi Speaking:'
                      : isListening
                      ? 'Your Voice:'
                      : 'Live Audio:'}
                  </span>
                  {isSpeaking && (
                    <button
                      onClick={onInterrupt}
                      className="text-amber-400 hover:text-amber-300 font-mono text-[9px] flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/40"
                    >
                      <Square className="w-2 h-2 fill-current" />
                      <span>Interrupt</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-white leading-relaxed line-clamp-3 font-medium">
                  {currentlySpeakingText ||
                    interimTranscript ||
                    'Listening... say "Hey Malvi" or your request'}
                </p>
              </div>
            )}
          </div>

        {/* Live Audio Visualizer Spectrum Bar */}
        <div className="w-full max-w-[360px] mt-4 flex flex-col items-center gap-2">
          <div className="w-full p-2.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 backdrop-blur-md flex items-center justify-between gap-3 shadow-inner">
            <MalviVoiceWaveform
              active={isSpeaking || isListening || isThinking}
              state={
                isSpeaking
                  ? 'speaking'
                  : isListening
                  ? 'listening'
                  : isThinking
                  ? 'thinking'
                  : state === 'interrupted'
                  ? 'interrupted'
                  : 'idle'
              }
              size="md"
            />
            <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap px-2">
              {isSpeaking
                ? 'Speech Active'
                : isListening
                ? 'Listening...'
                : isThinking
                ? 'Analyzing...'
                : 'Speech Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* Stage Interactive Voice Controls Pedestal */}
      <div className="relative z-10 p-4 border-t border-slate-800/80 bg-slate-950/70 backdrop-blur-md space-y-3">
        {/* Main Microphone & Voice Action Hub */}
        <div className="flex items-center justify-between gap-2">
          {/* Primary Big Voice Button */}
          <button
            onClick={onToggleMic}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-[0.98] ${
              isListening
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-emerald-500/30 animate-pulse'
                : isSpeaking
                ? 'bg-gradient-to-r from-amber-500 to-orange-400 text-slate-950 shadow-amber-500/30'
                : 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-cyan-500/25'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5" />
                <span>Tap to Stop Listening</span>
              </>
            ) : isSpeaking ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>Interrupt Malvi</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                <span>Talk to Malvi Now</span>
              </>
            )}
          </button>

          {/* Quick Voice Mode Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Hands-Free Loop Toggle */}
            <button
              onClick={onToggleHandsFree}
              className={`p-3 rounded-2xl border transition-all ${
                handsFreeMode
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-900/90 text-slate-400 hover:text-white border-slate-800'
              }`}
              title="Continuous Hands-Free Conversation Mode"
            >
              <Radio className="w-4 h-4" />
            </button>

            {/* Vocal Output Audio Toggle */}
            <button
              onClick={onToggleVoice}
              className={`p-3 rounded-2xl border transition-all ${
                voiceSpeechEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-900/90 text-slate-400 hover:text-white border-slate-800'
              }`}
              title={voiceSpeechEnabled ? 'Vocal replies enabled' : 'Vocal replies muted'}
            >
              {voiceSpeechEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* Speaking Rate / Speed */}
            <button
              onClick={onChangeSpeechRate}
              className="px-2.5 py-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-xs font-mono font-bold transition-colors flex items-center gap-1"
              title="Speaking speed rate"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{speechRate}x</span>
            </button>
          </div>
        </div>

        {/* Quick Suggestion Prompts Carousel */}
        {onQuickPrompt && (
          <div className="pt-1 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <span className="text-slate-500 text-[10px] font-mono shrink-0">Ask:</span>
            {[
              'Explain Langpretation',
              'Find an online Doctor',
              'Send money to Ghana',
              'What is my NV Number?',
            ].map((p, idx) => (
              <button
                key={idx}
                onClick={() => onQuickPrompt(p)}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 transition-colors shrink-0"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
