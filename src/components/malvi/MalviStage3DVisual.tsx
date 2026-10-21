import React from 'react';
import {
  FastForward,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Radio,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MalviAvatarState } from '../../types';
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
  const isSpeaking = state === 'speaking' || Boolean(currentlySpeakingText);
  const isThinking = state === 'thinking' || isProcessing;
  const status = isSpeaking
    ? { text: 'Responding', dot: 'bg-[#9ccabd]' }
    : isListening
      ? { text: 'Listening', dot: 'bg-[#b4d6a6]' }
      : isThinking
        ? { text: 'Processing', dot: 'bg-[#dfc79c]' }
        : state === 'interrupted'
          ? { text: 'Paused', dot: 'bg-[#dfc79c]' }
          : { text: 'Portrait preview', dot: 'bg-[#91aaa0]' };

  const actionButton =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-[#45615c] bg-[#183534] text-[#e4eee8] transition-colors hover:bg-[#224440] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bad9ca]';

  return (
    <section className="relative isolate flex flex-col overflow-hidden rounded-[28px] border border-[#39524e] bg-[#102422] text-[#edf3ec] shadow-[0_24px_70px_rgba(5,19,18,0.32)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-[#91b9a0]/10 blur-3xl"
      />

      <header className="flex items-center justify-between gap-3 border-b border-[#39524e]/80 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#708f7f]/60 bg-[#203c37] text-sm font-semibold text-[#e0eee4]">
            M
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-[0.01em]">Malvi</h2>
            <p className="text-[11px] text-[#a9beb2]">Nanivio assistant</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#45615c] bg-[#18312e] px-2.5 py-1 text-[11px] text-[#d0dfd6]">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.text}
          </span>
          {onToggleImmersive && (
            <button
              type="button"
              onClick={onToggleImmersive}
              className={`${actionButton} h-9 w-9`}
              aria-label={immersiveMode ? 'Exit expanded view' : 'Expand stage'}
              title={immersiveMode ? 'Exit expanded view' : 'Expand stage'}
            >
              {immersiveMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-6">
        <div className="relative aspect-[4/5] w-full max-w-[370px] overflow-hidden rounded-[24px] border border-[#55736a] bg-[#183432] shadow-[0_18px_55px_rgba(0,0,0,0.25)]">
          <MalviLivingMotionAvatar
            state={state}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isThinking={isThinking}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 pt-20">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#d0e2d5]/75">
              Nanivio · Malvi
            </p>
            <p className="mt-1 text-xs text-[#f1f3eb]/85">
              Static portrait preview
            </p>
          </div>
        </div>

        {(currentlySpeakingText || interimTranscript || isListening) && (
          <div
            aria-live="polite"
            className="w-full max-w-[370px] rounded-2xl border border-[#395d55] bg-[#18312e]/90 p-3.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a9c9b5]">
                {isSpeaking ? 'Assistant response' : isListening ? 'Your voice' : 'Transcript'}
              </span>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={onInterrupt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#78674c] bg-[#3d3527] px-2.5 py-1 text-[11px] text-[#f0dfbd] transition-colors hover:bg-[#50432f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e8d5ab]"
                >
                  <Square size={11} />
                  Interrupt
                </button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-[#edf3ec]">
              {currentlySpeakingText || interimTranscript || 'Listening for your request'}
            </p>
          </div>
        )}
      </div>

      <footer className="space-y-3 border-t border-[#39524e]/80 bg-[#0e201f]/75 p-4 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1e7d9] ${
              isListening
                ? 'bg-[#c0d9be] text-[#18352f] hover:bg-[#d2e5ce]'
                : isSpeaking
                  ? 'bg-[#e7cfa3] text-[#392f1f] hover:bg-[#f0dcb7]'
                  : 'bg-[#d2e6d9] text-[#163730] hover:bg-[#e0eee3]'
            }`}
          >
            {isListening ? (
              <>
                <MicOff size={17} />
                <span>Stop listening</span>
              </>
            ) : isSpeaking ? (
              <>
                <Square size={15} />
                <span>Interrupt Malvi</span>
              </>
            ) : (
              <>
                <Mic size={18} />
                <span>Talk to Malvi</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleHandsFree}
            aria-label={handsFreeMode ? 'Disable hands-free mode' : 'Enable hands-free mode'}
            aria-pressed={handsFreeMode}
            title={handsFreeMode ? 'Hands-free mode on' : 'Hands-free mode off'}
            className={`${actionButton} h-12 w-12 ${handsFreeMode ? 'border-[#95b7a2] bg-[#29463d] text-[#e0eee4]' : ''}`}
          >
            <Radio size={17} />
          </button>
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={voiceSpeechEnabled ? 'Disable voice replies' : 'Enable voice replies'}
            aria-pressed={voiceSpeechEnabled}
            title={voiceSpeechEnabled ? 'Voice replies enabled' : 'Voice replies muted'}
            className={`${actionButton} h-12 w-12 ${voiceSpeechEnabled ? 'border-[#95b7a2] bg-[#29463d] text-[#e0eee4]' : ''}`}
          >
            {voiceSpeechEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            type="button"
            onClick={onChangeSpeechRate}
            aria-label={`Change speech speed. Current speed ${speechRate} times.`}
            title="Change speech speed"
            className={`${actionButton} h-12 shrink-0 gap-1.5 px-3 text-xs font-medium tabular-nums`}
          >
            <FastForward size={14} />
            {speechRate}×
          </button>
        </div>

        {onQuickPrompt && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#96aaa0]">
              Try
            </span>
            {[
              'Explain Langpretation',
              'Find an online doctor',
              'Send money to Ghana',
              'What is my NV Number?',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onQuickPrompt(prompt)}
                className="shrink-0 rounded-full border border-[#42615a] bg-[#18312e] px-3 py-1.5 text-[11px] text-[#d8e5dc] transition-colors hover:border-[#86a896] hover:bg-[#24413b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c0d9be]"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </footer>
    </section>
  );
};
