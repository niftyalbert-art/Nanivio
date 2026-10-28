import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AudioLines, Camera, ImagePlus, LoaderCircle, Mic, MicOff, Square, Upload, X } from 'lucide-react';
import { MALVI_PROFILE } from '../../lib/malviIdentity';
import type { MalviAssetResult } from '../../shared/malviInputTypes';
import { MalviAssetResults } from './MalviAssetResults';
import type { MalviReferenceCitation } from '../../lib/malviLiveClient';
import { authClient } from '../../lib/authClient';
import { MalviUserTranscript } from './MalviUserTranscript';
import { malviPublicCopy } from '../../lib/malviPublicCopy';

export interface MalviLiveOverlayProps {
  voiceOnly?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoElement: (video: HTMLVideoElement | null) => void;
  phase: 'connecting' | 'connected' | 'error';
  error: string | null;
  secondsRemaining: number;
  onClose: () => void;
  onRetry?: () => void;
  onInterrupt: () => void;
  onPlayAudio: () => void;
  audioBlocked: boolean;
  caption?: string;
  approximateCaptions?: boolean;
  brainReady: boolean;
  microphoneOn: boolean;
  microphoneError: string;
  brainProvider: 'gemini' | 'openai' | null;
  onToggleMicrophone: () => void;
  references: MalviReferenceCitation[];
  referenceStatus: string;
  unavailableSources: string[];
  inputLevel?: number;
  inputState?: 'off' | 'connecting' | 'listening' | 'hearing' | 'processing';
  userTranscript?: string;
  speaking?: boolean;
  activeSessionId?: string | null;
  searchSuggestions?: string;
  memoryNotice?: string;
  assets?: MalviAssetResult | null;
  speechProvider?: 'gemini' | 'elevenlabs';
}

const suggestionsSrcDoc = (html: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;"><base target="_blank"></head>
<body style="margin:0;padding:8px;font:13px system-ui,sans-serif;color:#e4e0d4;background:#10201f">${html}</body></html>`;

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
  onRetry,
  onInterrupt,
  onPlayAudio,
  audioBlocked,
  caption,
  approximateCaptions = false,
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
  activeSessionId = null,
  searchSuggestions,
  memoryNotice,
  assets,
  speechProvider = 'gemini',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const activeSessionIdRef = useRef(activeSessionId);
  if (activeSessionIdRef.current !== activeSessionId) {
    activeSessionIdRef.current = activeSessionId;
    cameraRequestRef.current += 1;
  }
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [visionBusy, setVisionBusy] = useState(false);
  const [imageName, setImageName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  }, []);

  useEffect(() => {
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    stopCamera();
    setCameraError('');
    setImageFile(null);
    setImageName('');
    return () => stopCamera();
  }, [activeSessionId, stopCamera]);

  const startCamera = async () => {
    if (!activeSessionId || phase !== 'connected' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(!activeSessionId ? 'Camera sharing is unavailable until the active session ID is connected.' : 'Camera access is not available in this browser.');
      return;
    }
    stopCamera();
    const request = ++cameraRequestRef.current;
    const requestedSessionId = activeSessionId;
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 } },
        audio: false,
      });
      if (request !== cameraRequestRef.current || !requestedSessionId || activeSessionIdRef.current !== requestedSessionId) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (reason) {
      if (request !== cameraRequestRef.current || activeSessionIdRef.current !== requestedSessionId) return;
      setCameraError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Camera permission was not granted. You can choose an image instead.'
        : reason instanceof Error ? reason.message : 'The camera could not be opened.');
    }
  };

  const makeJpeg = async (source: HTMLVideoElement | HTMLImageElement | ImageBitmap): Promise<string> => {
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth
      : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight
      : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) throw new Error('The image is not ready yet. Try again in a moment.');
    const scale = Math.min(1, 640 / sourceWidth, 480 / sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The image could not be prepared.')), 'image/jpeg', 0.82));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
    }
    return btoa(binary);
  };

  const shareJpeg = async (image: string) => {
    if (!activeSessionId || activeSessionIdRef.current !== activeSessionId) throw new Error('The active live session is not available. Close and reconnect before sharing.');
    const token = authClient.getToken();
    const response = await fetch(`/api/assistant/session/${encodeURIComponent(activeSessionId)}/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ image, consent: true }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'Image sharing is unavailable for this session.');
  };

  const shareCameraFrame = async () => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream || visionBusy) return;
    setVisionBusy(true);
    setCameraError('');
    try {
      const image = await makeJpeg(video);
      await shareJpeg(image);
      setCameraError('One still image was shared with the selected AI. No continuous video was sent.');
    } catch (reason) {
      setCameraError(reason instanceof Error ? reason.message : 'This view could not be shared.');
    } finally {
      setVisionBusy(false);
    }
  };

  const chooseImage = async (file?: File) => {
    setCameraError('');
    if (!file) { setImageFile(null); setImageName(''); return; }
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 512 * 1024) {
      setImageFile(null);
      setImageName('');
      setCameraError('Choose a JPEG or PNG image up to 512 KB.');
      return;
    }
    setImageFile(file);
    setImageName(file.name);
  };

  const shareSelectedImage = async () => {
    if (!imageFile || visionBusy) return;
    setVisionBusy(true);
    setCameraError('');
    try {
      const bitmap = await createImageBitmap(imageFile);
      try {
        const image = await makeJpeg(bitmap);
        await shareJpeg(image);
        setCameraError('One still image was shared with the selected AI. It is not saved to Nanivio conversation history; provider handling is separate.');
      } finally {
        bitmap.close();
      }
    } catch (reason) {
      setCameraError(reason instanceof Error ? reason.message : 'This image could not be shared.');
    } finally {
      setVisionBusy(false);
    }
  };

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
    connecting: 'Connecting Nanivio Mic…',
    listening: 'Listening…',
    hearing: 'Hearing you…',
    processing: 'Malvi is thinking…',
  }[listeningState];
  const safeInputLevel = Number.isFinite(inputLevel) ? Math.min(1, Math.max(0, inputLevel)) : 0;
  const meterBars = [0.16, 0.34, 0.53, 0.72, 0.91];

  return createPortal(
    <div className="fixed inset-0 z-[100] isolate flex h-[100dvh] min-h-0 items-center justify-center overflow-hidden bg-[#071311] text-[#f1f3eb]">
      {!voiceOnly && <video
        ref={onVideoElement}
        autoPlay
        playsInline
        aria-label="Malvi live video"
        className="absolute inset-0 h-full w-full object-contain object-center md:w-[calc(100%_-_22rem)]"
      />}

      {!voiceOnly && (phase === 'connecting' || phase === 'error') && (
        <div className="absolute inset-0 -z-0 overflow-hidden bg-[#172e2d]">
          <img
            src={MALVI_PROFILE}
            alt={phase === 'connecting' ? 'Malvi portrait preview while connecting' : 'Malvi portrait preview'}
            className="absolute inset-0 h-full w-full object-contain object-center opacity-75 md:w-[calc(100%_-_22rem)]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#10201f]/45 via-[#10201f]/15 to-[#081614]/80" />
        </div>
      )}

      {!voiceOnly && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[22rem] border-l border-white/10 bg-[#071311] md:block" />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#071311]/60 via-transparent to-[#071311]/75" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="malvi-live-title"
        aria-describedby="malvi-live-disclosure"
        tabIndex={-1}
        className="relative z-10 flex h-full min-h-0 w-full flex-col outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-7 sm:pt-[max(1.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-[#10201f]/65 px-3.5 py-2.5 backdrop-blur-md sm:px-4">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#bad5c7]/35 bg-[#28453d] text-sm font-semibold text-[#e2eee4]">
              M
            </span>
            <div>
              <h1 id="malvi-live-title" className="text-sm font-semibold tracking-wide text-white">
                Malvi <span className="font-normal text-[#cfddd4]">· {voiceOnly ? 'Voice' : 'Nanivio'}</span>
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

        {phase === 'connected' && (caption?.trim() || userTranscript?.trim()) && (
          <div aria-label="Conversation subtitles" className={`flex max-h-[48dvh] w-full shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-4 pt-2 sm:px-7 ${!voiceOnly ? 'md:ml-auto md:w-[22rem] md:px-4' : ''}`}>
            {caption?.trim() && <MalviUserTranscript text={caption} speaker="malvi" compact label={`${speaking ? 'Malvi is speaking' : 'Malvi'}${approximateCaptions ? ' · Approximate captions' : ''}`} />}
            {userTranscript?.trim() && <MalviUserTranscript text={userTranscript} compact />}
          </div>
        )}

        <footer aria-label="Live session controls" className={`flex max-h-[30dvh] min-h-0 shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3 sm:px-7 sm:pb-[max(1.75rem,env(safe-area-inset-bottom))] [&>*]:shrink-0 ${!voiceOnly ? 'md:ml-auto md:w-[22rem] md:px-4' : ''}`}>
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
          {phase === 'connected' && (
            <details className="w-full max-w-lg overflow-hidden rounded-xl border border-[#b89a5a]/25 bg-[#10201f]/80 text-left text-[11px] text-[#e0e8e2]/85 backdrop-blur-md">
              <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 font-medium text-[#e3d09a] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d6e7da]">
                <Camera size={14} /> Share a still view · optional
              </summary>
              <div className="max-h-[34dvh] space-y-3 overflow-y-auto border-t border-white/10 px-3 py-3">
                <p className="leading-relaxed text-[#d9dfd9]/80">
                  A still image is shared with the selected AI to discuss visible objects, colours, or surroundings. It is not for diagnosis, emotion, or identity inference. Images are not saved to Nanivio conversation history; provider handling is separate. Camera access is preview-only until you tap “Share this view”; video is never streamed to the AI.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {!cameraStream ? (
                    <button type="button" onClick={() => void startCamera()} disabled={!activeSessionId || visionBusy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#b89a5a]/45 bg-[#b89a5a]/10 px-3 text-xs font-semibold text-[#ead9a7] hover:bg-[#b89a5a]/20 disabled:cursor-not-allowed disabled:opacity-45">
                      <Camera size={14} /> Allow camera preview
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void shareCameraFrame()} disabled={visionBusy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#d4bd7d] px-3 text-xs font-semibold text-[#17201c] hover:bg-[#e2d09f] disabled:opacity-50">
                        {visionBusy ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <ImagePlus size={14} />}
                        Share this view
                      </button>
                      <button type="button" onClick={stopCamera} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-medium text-white hover:bg-white/10">
                        <Square size={12} /> Stop camera
                      </button>
                    </>
                  )}
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-medium text-white hover:bg-white/10">
                    <Upload size={14} /> Choose JPEG / PNG
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png"
                      disabled={!activeSessionId || visionBusy}
                      onChange={event => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
                    />
                  </label>
                </div>
                {cameraStream && (
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Private camera preview, not shared until you select Share this view"
                    className="max-h-28 w-auto max-w-full rounded-lg border border-white/20 bg-black object-contain"
                  />
                )}
                {imageFile && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-[#e2e0d7]">{imageName} · {(imageFile.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => void shareSelectedImage()} disabled={visionBusy} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[#d4bd7d] px-2.5 text-[11px] font-semibold text-[#17201c] disabled:opacity-50">
                      {visionBusy ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : <ImagePlus size={13} />}
                      Share image
                    </button>
                    <button type="button" onClick={() => { setImageFile(null); setImageName(''); }} disabled={visionBusy} className="min-h-8 px-2 text-[11px] text-white/75 underline underline-offset-4 disabled:opacity-50">Remove</button>
                  </div>
                )}
                {!activeSessionId && <p role="status" className="text-[#e3d09a]">Image sharing is unavailable until the active session ID is passed to this overlay.</p>}
                {cameraError && <p role={cameraError.includes('shared') ? 'status' : 'alert'} className="break-words text-[#f0d5bd]">{malviPublicCopy(cameraError)}</p>}
                <p className="text-[10px] leading-relaxed text-white/55">Selected image limit: JPEG or PNG up to 512 KB. Shared stills are converted to JPEG at no more than 640 × 480 before upload.</p>
              </div>
            </details>
          )}
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
                  <p className="mt-1">{malviPublicCopy(error || 'Please close this window and try again.')}</p>
                  {onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-[#e3d09a]/60 px-4 py-2 font-semibold text-[#e3d09a]">Start a new conversation</button>}
                </div>
              )}
              {microphoneError && (
                <p role="alert" className={`${phase !== 'connected' ? 'mt-2 border-t border-white/10 pt-2 ' : ''}text-[#ffe0d4]`}>
                  {malviPublicCopy(microphoneError)}
                </p>
              )}
            </div>
          )}
          {assets && phase === 'connected' && (
            <details className="rounded-xl border border-white/15 bg-[#101916]/95 px-3 py-2 text-white">
              <summary className="cursor-pointer text-xs font-semibold">Media &amp; Nanivio map results</summary>
              <div className="max-h-64 overflow-y-auto"><MalviAssetResults {...assets} /></div>
            </details>
          )}
          {memoryNotice && phase === 'connected' && (
            <p role="status" className="max-h-16 w-full max-w-lg overflow-y-auto rounded-lg border border-[#b89a5a]/25 bg-[#10201f]/75 px-3 py-2 text-center text-[10px] leading-relaxed text-[#e4d3a8] backdrop-blur-md">
              {memoryNotice}
            </p>
          )}
          <details className="max-w-lg rounded-xl bg-[#10201f]/60 px-3 py-2 text-center text-[11px] leading-relaxed text-[#e0e8e2]/80 backdrop-blur-md">
            <summary className="cursor-pointer underline underline-offset-4">Audio &amp; sources</summary>
            <p className="mt-2">
              Nanivio processes your speech using connected AI services. Research uses public sources; do not include private account information in searches.
            </p>
            <p className="mt-2">
              {microphoneOn
                ? 'Microphone on · Nanivio is processing your audio.'
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
            {searchSuggestions && (
              <div className="mt-3 rounded-lg border border-white/10 bg-[#10201f]/70 p-2 text-left">
                <p className="mb-2 text-[10px] font-medium text-[#e6f0e7]">Trusted-provider search suggestions</p>
                <iframe
                  title="Trusted provider search suggestions"
                  srcDoc={suggestionsSrcDoc(searchSuggestions)}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  className="h-24 w-full rounded-md border border-white/10 bg-[#10201f]"
                />
              </div>
            )}
          </details>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
