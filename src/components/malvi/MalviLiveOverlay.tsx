import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AudioLines, LoaderCircle, Mic, MicOff, X } from 'lucide-react';
import { MALVI_PROFILE } from '../../lib/malviIdentity';
import type { MalviReferenceCitation } from '../../lib/malviLiveClient';

export interface MalviLiveOverlayProps {
  voiceOnly?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoElement: (video: HTMLVideoElement | null) => void;
  phase: 'connecting' | 'connected' | 'error';
  error: string | null;
  secondsRemaining: number;
  onClose: () => void;
  onInterrupt: () => void;
  onPlayAudio: () => void;
  audioBlocked: boolean;
  caption?: string;
  brainReady: boolean;
  microphoneOn: boolean;
  microphoneError: string;
  brainProvider: 'gemini' | 'openai' | null;
  onToggleMicrophone: () => void;
  references: MalviReferenceCitation[];
  referenceStatus: string;
  unavailableSources: string[];
  inputLevel?: number;
  inputState?: 'off' | 'listening' | 'hearing' | 'processing';
  userTranscript?: string;
  speaking?: boolean;
}

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
};

export const MalviLiveOverlay: React.FC<MalviLiveOverlayProps> = ({
  voiceOnly = false,
  onVideoElement,
  phase,
  error,
  secondsRemaining,
  onClose,
  onInterrupt,
  onPlayAudio,
  audioBlocked,
  caption,
  brainReady,
  microphoneOn,
  microphoneError,
  brainProvider,
  onToggleMicrophone,
  references,
  referenceStatus,
  unavailableSources,
  inputLevel = 0,
  inputState,
  userTranscript,
  speaking = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = (Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ) as HTMLElement[]).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const handleEnableAudio = () => {
    onPlayAudio();
  };

  const phaseCopy = {
    connecting: 'Connecting',
    connected: 'Connected',
    error: 'Connection issue',
  }[phase];
  const listeningState = !microphoneOn ? 'off' : inputState ?? 'listening';
  const listeningCopy = {
    off: 'Microphone off',
    listening: 'Listening…',
    hearing: 'Hearing you…',
    processing: 'Malvi is thinking…',
  }[listeningState];
  const safeInputLevel = Number.isFinite(inputLevel) ? Math.min(1, Math.max(0, inputLevel)) : 0;
  const meterBars = [0.16, 0.34, 0.53, 0.72, 0.91];

  return createPortal(
    <div className="fixed inset-0 z-[100] isolate flex min-h-[100dvh] items-center justify-center overflow-x-hidden overflow-y-auto bg-[#071311] text-[#f1f3eb]">
      {!voiceOnly && <video
        ref={onVideoElement}
        autoPlay
        playsInline
        aria-label="Malvi live video"
        className="absolute inset-0 h-full w-full object-cover"
      />}

      {!voiceOnly && (phase === 'connecting' || phase === 'error') && (
        <div className="absolute inset-0 -z-0 overflow-hidden bg-[#172e2d]">
          <img
            src={MALVI_PROFILE}
            alt={phase === 'connecting' ? 'Malvi portrait preview while connecting' : 'Malvi portrait preview'}
            className="h-full w-full object-cover object-[50%_32%] opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#10201f]/45 via-[#10201f]/15 to-[#081614]/80" />
        </div>
      )}

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#071311]/60 via-transparent to-[#071311]/75" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="malvi-live-title"
        aria-describedby="malvi-live-disclosure"
        tabIndex={-1}
        className="relative z-10 flex min-h-[100dvh] w-full flex-col justify-between outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-7 sm:pt-[max(1.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-[#10201f]/65 px-3.5 py-2.5 backdrop-blur-md sm:px-4">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#bad5c7]/35 bg-[#28453d] text-sm font-semibold text-[#e2eee4]">
              M
            </span>
            <div>
              <h1 id="malvi-live-title" className="text-sm font-semibold tracking-wide text-white">
                Malvi <span className="font-normal text-[#cfddd4]">· {voiceOnly ? 'Voice-only test' : 'Nanivio'}</span>
              </h1>
              <p id="malvi-live-disclosure" className="mt-0.5 text-[11px] text-[#dae4dd]/80">
                AI assistant · {phase === 'connected' ? (voiceOnly ? 'Voice connected · no avatar' : 'Live session connected') : phaseCopy}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-[#10201f]/65 px-3.5 py-2.5 text-xs text-[#f1f3eb] backdrop-blur-md sm:flex">
              <span className="text-[#c0d1c8]/75">Idle session</span>
              <span className="font-mono tabular-nums">{formatTime(secondsRemaining)}</span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-[#10201f]/70 px-3.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-[#1d3834]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6e7da]"
              aria-label="End session and close"
            >
              <span className="hidden sm:inline">End session</span>
              <X size={16} />
            </button>
          </div>
        </header>

        <div aria-hidden="true" className="min-h-0 flex-1" />

        <footer className="flex shrink-0 flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:gap-3 sm:px-7 sm:pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          {caption && phase === 'connected' && (
            <div
              role="region"
              aria-label="Live subtitles"
              aria-live="polite"
              aria-relevant="text"
              tabIndex={0}
              className="max-h-[4.8rem] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#10201f]/85 px-4 py-2.5 text-center text-sm leading-6 text-white shadow-lg backdrop-blur-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6e7da]"
            >
              {speaking && <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-[#c0d1c8]/75">Malvi is speaking</span>}
              {caption}
            </div>
          )}
          {phase === 'connected' && (
            <div className="flex min-h-7 items-center justify-center gap-2.5 text-[11px] text-[#e0e8e2]/90" aria-label={`Microphone status: ${listeningCopy}`}>
              <span aria-hidden="true" className="flex h-4 items-center gap-[3px]">
                {meterBars.map((threshold, index) => (
                  <span
                    key={threshold}
                    className={`w-[3px] rounded-full ${microphoneOn && safeInputLevel >= threshold ? 'bg-[#c9e2cf]' : 'bg-white/25'}`}
                    style={{ height: `${5 + index * 1.5}px` }}
                  />
                ))}
              </span>
              <span role="status" aria-live="polite">{listeningCopy}</span>
            </div>
          )}
          {userTranscript?.trim() && phase === 'connected' && (
            <div
              role="region"
              aria-label="Your recognized speech"
              aria-live="polite"
              aria-relevant="text"
              tabIndex={0}
              className="max-h-12 w-full max-w-xl overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#10201f]/70 px-3 py-1.5 text-center text-xs leading-5 text-[#e3ebe5]/90 backdrop-blur-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6e7da]"
            >
              <span className="font-medium text-[#c9e2cf]">You:</span>{' '}
              <span className="break-words">{userTranscript}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleMicrophone}
            disabled={!brainReady || phase !== 'connected'}
            aria-pressed={microphoneOn}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#d6e6d9] px-5 text-sm font-semibold text-[#18352f] transition-colors hover:bg-[#e3eee3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55"
          >
            {microphoneOn ? <MicOff size={18} /> : <Mic size={18} />}
            {microphoneOn ? 'Turn microphone off' : brainReady ? 'Start talking' : 'Connecting Malvi’s brain…'}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#10201f]/65 px-3.5 py-2.5 text-xs text-[#f1f3eb] backdrop-blur-md sm:hidden">
              <span className="text-[#c0d1c8]/75">Idle session</span>
              <span className="font-mono tabular-nums">{formatTime(secondsRemaining)}</span>
            </div>
            {audioBlocked && phase === 'connected' && (
              <button
                type="button"
                onClick={handleEnableAudio}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d6e6d9] px-4 text-xs font-semibold text-[#18352f] transition-colors hover:bg-[#e3eee3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <AudioLines size={16} />
                Enable sound
              </button>
            )}
            {phase === 'connected' && (
              <button
                type="button"
                onClick={onInterrupt}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-[#10201f]/70 px-4 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-[#1d3834]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6e7da]"
              >
                <MicOff size={15} />
                Interrupt
              </button>
            )}
          </div>
          {(phase === 'connecting' || phase === 'error' || microphoneError) && (
            <div
              role="region"
              aria-label="Session status and feedback"
              tabIndex={0}
              className="max-h-24 w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-[#10201f]/85 px-3.5 py-2.5 text-center text-xs leading-relaxed text-[#f1f3eb] backdrop-blur-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6e7da]"
            >
              {phase === 'connecting' && (
                <div role="status" className="flex items-start justify-center gap-2 text-[#e6f0e7]">
                  <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#d3e4d7] motion-reduce:animate-none" />
                  <span>
                    <span className="block font-medium">Joining your conversation</span>
                    <span className="text-[#d5e1d9]/75">
                      {voiceOnly ? 'Connecting the selected brain. No avatar session is running.' : 'Malvi’s portrait is a preview until the live video connects.'}
                    </span>
                  </span>
                </div>
              )}
              {phase === 'error' && (
                <div role="alert" className="text-[#f0ded0]">
                  <p className="flex items-center justify-center gap-2 font-medium">
                    <AlertCircle size={15} className="shrink-0 text-[#e6c4a9]" />
                    We couldn’t connect just now
                  </p>
                  <p className="mt-1">{error || 'Please close this window and try again.'}</p>
                </div>
              )}
              {microphoneError && (
                <p role="alert" className={`${phase !== 'connected' ? 'mt-2 border-t border-white/10 pt-2 ' : ''}text-[#ffe0d4]`}>
                  {microphoneError}
                </p>
              )}
            </div>
          )}
          <details className="max-w-lg rounded-xl bg-[#10201f]/60 px-3 py-2 text-center text-[11px] leading-relaxed text-[#e0e8e2]/80 backdrop-blur-md">
            <summary className="cursor-pointer underline underline-offset-4">Audio &amp; sources</summary>
            <p className="mt-2">
              Voice responses are sent to ElevenLabs. Relevant topic queries may be sent automatically to Wikipedia/Wikidata or arXiv/PubMed for reference lookup.
            </p>
            <p className="mt-2">
              {microphoneOn
                ? `Microphone on · audio is sent to ${brainProvider === 'openai' ? 'OpenAI GPT-Live' : 'Gemini Live'} through Nanivio.`
                : 'Your microphone stays off until you choose Start talking.'}
            </p>
            {phase === 'connected' && referenceStatus !== 'idle' && (
              <div className="mt-3 rounded-lg border border-white/10 bg-[#10201f]/70 px-3 py-2 text-left">
                <p role="status" className="text-[#e6f0e7]">
                  {referenceStatus === 'searching' ? 'Checking relevant reference sources…'
                    : references.length ? `${references.length} reference results retrieved`
                    : referenceStatus === 'unavailable' ? 'Reference lookup unavailable. No sources were verified.'
                    : 'No reference results were returned.'}
                </p>
                {unavailableSources.length > 0 && <p className="mt-1 text-amber-200">Unavailable: {unavailableSources.join(', ')}</p>}
                {references.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium underline underline-offset-4">View reference links and limitations</summary>
                    <ul className="mt-3 max-h-36 space-y-3 overflow-y-auto pr-2">
                      {references.map((reference, index) => (
                        <li key={`${reference.url}-${index}`}>
                          <a href={reference.url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-200 underline underline-offset-2">
                            {reference.title}
                          </a>
                          <p className="mt-1 text-white/70">{reference.source}{reference.published ? ` · ${reference.published}` : ''}</p>
                          <p className="mt-1 text-white/60">{reference.caveat}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </details>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
