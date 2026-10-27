import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileAudio2, FileText, LoaderCircle, MapPin, Mic, Navigation, Paperclip, RotateCcw, Send, Square, X } from 'lucide-react';
import { authClient } from '../../lib/authClient';
import { lookupApproximateIpLocation, researchMalviMedia, sendMalviInput } from '../../lib/malviInputClient';
import { googleMapsDirections, googleMapsSearch, INPUT_ACCEPT, MAX_INPUT_BYTES, MAX_TEXT_BYTES, MAX_VIDEO_SECONDS, validateSharedLocation } from '../../shared/malviInputTypes';
import type { MalviInputResult, MalviMediaItem, MalviSharedLocation } from '../../shared/malviInputTypes';
import { MalviAssetResults, type MalviAssetPayload } from './MalviAssetResults';
import { MalviResultPanel } from './MalviResultPanel';
import { malviPublicCopy } from '../../lib/malviPublicCopy';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json']);
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
};
const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function validateAttachment(file: File): File {
  const extension = fileExtension(file.name);
  if (!MIME_BY_EXTENSION[extension]) throw new Error('Choose a JPEG, PNG, MP4, WebM, MP3, WAV, OGG, PDF, TXT, MD, CSV, or JSON file.');
  const mime = MIME_BY_EXTENSION[extension];
  const isText = TEXT_EXTENSIONS.has(extension);
  const max = isText ? MAX_TEXT_BYTES : MAX_INPUT_BYTES;
  if (file.size > max) throw new Error(isText ? 'Text files must be 128 KiB or smaller.' : 'Attachments must be 8 MiB or smaller.');
  return new File([file], file.name, { type: mime });
}

const safeMediaItems = (research: unknown): MalviMediaItem[] => {
  if (!research || typeof research !== 'object') return [];
  const candidate = research as { items?: unknown };
  return Array.isArray(candidate.items) ? candidate.items.filter(item => item && typeof item === 'object'
    && (item.kind === 'image' || item.kind === 'video') && typeof item.url === 'string') as MalviMediaItem[] : [];
};

type Props = { language: string };

export const MalviInputWorkspace: React.FC<Props> = ({ language }) => {
  const [prompt, setPrompt] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<MalviInputResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState<MalviSharedLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordPermissionPending, setRecordPermissionPending] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mediaItems, setMediaItems] = useState<MalviMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaNotice, setMediaNotice] = useState('');
  const [mediaQuery, setMediaQuery] = useState('');
  const [incomingAssets, setIncomingAssets] = useState<MalviAssetPayload | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStartPendingRef = useRef(false);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingBytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const recordTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef('');
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const mediaRequestRef = useRef<AbortController | null>(null);
  const mediaGenerationRef = useRef(0);
  const locationRequestRef = useRef<AbortController | null>(null);
  const locationGenerationRef = useRef(0);

  const revokePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPreviewUrl('');
  };
  const stopTracks = () => {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
  };
  const clearRecordingTimer = () => {
    if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
  };
  const stopRecorder = (discard: boolean, updateState = true) => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      if (discard) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
      }
      try { recorder.stop(); } catch {}
    }
    recorderRef.current = null;
    stopTracks();
    clearRecordingTimer();
    if (updateState) setRecording(false);
    if (discard) recordingChunksRef.current = [];
  };
  const setSelectedFile = (file: File | null) => {
    revokePreview();
    setAttachment(file);
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      const nextUrl = URL.createObjectURL(file);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      locationGenerationRef.current += 1;
      recordStartPendingRef.current = false;
      requestRef.current?.abort();
      mediaRequestRef.current?.abort();
      locationRequestRef.current?.abort();
      stopRecorder(true, false);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    };
    // Cleanup is intentionally account-bound by the parent's keyed workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const receiveAssets = (event: Event) => {
      const detail = (event as CustomEvent<MalviAssetPayload>).detail;
      if (!detail || typeof detail !== 'object') return;
      setIncomingAssets({
        ...(Array.isArray(detail.media) ? { media: detail.media } : {}),
        ...(detail.map && typeof detail.map === 'object' ? { map: detail.map } : {}),
        ...(typeof detail.limitation === 'string' ? { limitation: detail.limitation } : {}),
      });
    };
    window.addEventListener('nanivio:malvi-assets', receiveAssets);
    return () => window.removeEventListener('nanivio:malvi-assets', receiveAssets);
  }, []);

  const reset = () => {
    generationRef.current += 1;
    recordStartPendingRef.current = false;
    locationGenerationRef.current += 1;
    requestRef.current?.abort();
    mediaRequestRef.current?.abort();
    mediaRequestRef.current = null;
    mediaGenerationRef.current += 1;
    locationRequestRef.current?.abort();
    locationRequestRef.current = null;
    requestRef.current = null;
    stopRecorder(true);
    revokePreview();
    setPrompt('');
    setSelectedFile(null);
    setConsent(false);
    setResult(null);
    setError('');
    setBusy(false);
    setLocation(null);
    setLocationStatus('');
    setOrigin('');
    setDestination('');
    setRecordSeconds(0);
    setRecordPermissionPending(false);
    setMediaItems([]);
    setMediaQuery('');
    setMediaError('');
    setMediaNotice('');
    setIncomingAssets(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const chooseFile = (file?: File) => {
    if (!file) return;
    setError('');
    try {
      setSelectedFile(validateAttachment(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That attachment is not supported.');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser. Choose an audio file instead.');
      return;
    }
    if (recording || busy || recordStartPendingRef.current) return;
    recordStartPendingRef.current = true;
    setRecordPermissionPending(true);
    const generation = generationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mountedRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      recordingStreamRef.current = stream;
      const supported = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported?.(type));
      if (!supported) {
        stopTracks();
        setError('This browser cannot record in a supported audio format. Choose an audio file instead.');
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: supported });
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingBytesRef.current = 0;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = event => {
        if (!event.data.size || !mountedRef.current || generation !== generationRef.current) return;
        recordingBytesRef.current += event.data.size;
        if (recordingBytesRef.current > MAX_INPUT_BYTES) {
          setError('Recording reached the 8 MiB limit and was discarded.');
          stopRecorder(true);
          return;
        }
        recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current.splice(0);
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (!chunks.length) {
          setError('No audio was captured. Record for a moment before stopping, or choose an audio file.');
          return;
        }
        try {
          const recordedBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const context = new AudioContext();
          let decoded: AudioBuffer;
          try {
            decoded = await context.decodeAudioData(await recordedBlob.arrayBuffer());
          } finally {
            await context.close().catch(() => {});
          }
          if (!mountedRef.current || generation !== generationRef.current) return;
          const targetRate = 16000;
          const ratio = decoded.sampleRate / targetRate;
          const samples = Math.max(1, Math.floor(decoded.length / ratio));
          const pcm = new Int16Array(samples);
          const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
          for (let i = 0; i < samples; i++) {
            let sample = 0;
            for (const channel of channels) sample += channel[Math.min(channel.length - 1, Math.floor(i * ratio))] || 0;
            sample /= channels.length;
            sample = Math.max(-1, Math.min(1, sample));
            pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
          const buffer = new ArrayBuffer(44 + pcm.length * 2);
          const view = new DataView(buffer);
          const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
          write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
          view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
          view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
          view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, pcm.length * 2, true);
          new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
          const wav = new File([buffer], 'malvi-recording.wav', { type: 'audio/wav' });
          if (wav.size > MAX_INPUT_BYTES) throw new Error('Recording must be 8 MiB or smaller.');
          setSelectedFile(validateAttachment(wav));
        } catch {
          if (mountedRef.current && generation === generationRef.current) setError('This browser could not convert the recording. Try recording again or choose a WAV, MP3, or OGG file.');
        }
      };
      recorder.start(500);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setRecordSeconds(seconds);
        if (seconds >= MAX_VIDEO_SECONDS) {
          recorderRef.current?.stop();
          setRecording(false);
          stopTracks();
          clearRecordingTimer();
        }
      }, 250);
    } catch (reason) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      const message = reason instanceof Error && reason.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access or choose an audio file.'
        : 'The microphone could not be opened. Check that it is connected and try again.';
      setError(message);
      stopTracks();
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        recordStartPendingRef.current = false;
        setRecordPermissionPending(false);
      }
    }
  };

  const acquireGps = () => {
    setLocationStatus('');
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported by this browser.');
      return;
    }
    const generation = ++locationGenerationRef.current;
    setLocationStatus('Waiting for your permission and location…');
    navigator.geolocation.getCurrentPosition(position => {
      if (!mountedRef.current || generation !== locationGenerationRef.current) return;
      try {
        setLocation(validateSharedLocation({
          kind: 'gps', latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy, label: 'Current GPS location',
        }));
        setLocationStatus('GPS location ready. It is shared only if you choose Send to AI.');
      } catch (reason) {
        setLocationStatus(reason instanceof Error ? reason.message : 'Location could not be validated.');
      }
    }, reason => {
      if (!mountedRef.current || generation !== locationGenerationRef.current) return;
      setLocationStatus(reason.code === reason.PERMISSION_DENIED ? 'Location permission was denied. You can continue without it.'
        : reason.code === reason.TIMEOUT ? 'Location lookup timed out. Try again or continue without it.'
          : 'Your current location is unavailable. Try again or continue without it.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 });
  };

  const acquireIp = async () => {
    const generation = ++locationGenerationRef.current;
    locationRequestRef.current?.abort();
    const controller = new AbortController();
    locationRequestRef.current = controller;
    setLocationStatus('Checking approximate network location…');
    try {
      const value = await lookupApproximateIpLocation(controller.signal);
      if (!mountedRef.current || generation !== locationGenerationRef.current) return;
      setLocation(validateSharedLocation(value));
      setLocationStatus('Approximate IP location ready. It can be wrong, especially with a VPN. Shared only if you choose Send to AI.');
    } catch (reason) {
      if (mountedRef.current && generation === locationGenerationRef.current) {
        setLocationStatus(reason instanceof Error ? reason.message : 'Approximate location is unavailable.');
      }
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text && !attachment) {
      setError('Add a question, request, or attachment before sending.');
      return;
    }
    if (text.length > 6000) {
      setError('Keep your question to 6,000 characters or fewer.');
      return;
    }
    if (!consent) {
      setError('Review the provider-use notice and confirm before sending.');
      return;
    }
    if (!authClient.getToken()) {
      setError('Your sign-in has expired. Sign in again to send this request.');
      return;
    }
    const generation = ++generationRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    setMediaItems([]);
    setMediaError('');
    setMediaNotice('');
    try {
      const response = await sendMalviInput({ prompt: text, language, attachment: attachment || undefined, location: location || undefined, signal: controller.signal });
      if (!mountedRef.current || generation !== generationRef.current) return;
      setResult(response);
      setMediaItems(safeMediaItems(response.research));
    } catch (reason) {
      if (!mountedRef.current || generation !== generationRef.current || controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Malvi could not complete that request. Try again.');
    } finally {
      if (mountedRef.current && generation === generationRef.current) setBusy(false);
    }
  };

  const searchMedia = async (query: string, kind: 'images' | 'videos') => {
    mediaRequestRef.current?.abort();
    const controller = new AbortController();
    mediaRequestRef.current = controller;
    const generation = ++mediaGenerationRef.current;
    setMediaLoading(true);
    setMediaError('');
    setMediaNotice('');
    try {
      const response = await researchMalviMedia(query, kind, controller.signal);
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      setMediaItems(response.items || []);
      setMediaNotice(response.limitation || '');
      if (!response.items?.length) setMediaNotice(response.limitation || 'No licensed results were found for that search.');
    } catch (reason) {
      if (!mountedRef.current || generation !== mediaGenerationRef.current || controller.signal.aborted) return;
      setMediaError(reason instanceof Error ? reason.message : 'Licensed media search is unavailable right now.');
    } finally {
      if (mountedRef.current && generation === mediaGenerationRef.current) setMediaLoading(false);
    }
  };

  const isImage = attachment?.type.startsWith('image/');
  const isVideo = attachment?.type.startsWith('video/');
  const isAudio = attachment?.type.startsWith('audio/');
  let directionsUrl = '';
  let mapSearchUrl = '';
  let sharedLocationUrl = '';
  if (destination.trim()) {
    try {
      const manualOrigin = origin.trim();
      const selectedGps = location?.kind === 'gps' ? location : undefined;
      directionsUrl = googleMapsDirections(destination.trim(), manualOrigin || selectedGps);
      mapSearchUrl = googleMapsSearch(destination.trim());
    } catch {
      directionsUrl = '';
      mapSearchUrl = '';
    }
  }
  if (location) {
    try {
      sharedLocationUrl = googleMapsSearch(`${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`);
    } catch {
      sharedLocationUrl = '';
    }
  }

  return (
    <section aria-label="Ask Malvi with voice, image, or document" className="overflow-hidden rounded-3xl border border-[#b89a5a]/35 bg-[#141713] text-[#f0eee7] shadow-xl">
      <div className="flex flex-col gap-2 border-b border-white/[.08] bg-[#191c17] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#d5bf80]">A question can take any shape</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#f1eee5]">Ask by text, voice, or attachment</h2>
        </div>
        <button type="button" onClick={reset} disabled={busy || recording} className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-white/[.12] px-3 text-xs text-[#c6c4bc] hover:bg-white/[.06] disabled:opacity-45 sm:self-auto"><RotateCcw size={13} />Reset workspace</button>
      </div>

      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <div>
          <label htmlFor="malvi-input-prompt" className="mb-1.5 block text-xs font-semibold text-[#e6dfca]">What would you like Malvi to help with?</label>
          <textarea id="malvi-input-prompt" value={prompt} maxLength={6000} rows={3} onChange={event => setPrompt(event.target.value)}
            placeholder="Ask about a scene, a voice note, a document, or something you’re planning…" className="min-h-24 w-full resize-y rounded-xl border border-[#514e43] bg-[#0d100e] px-3.5 py-3 text-sm leading-relaxed text-[#f0eee7] placeholder:text-[#85857f] focus:border-[#d4bd7d] focus:outline-none focus:ring-2 focus:ring-[#d4bd7d]/20" />
          <div className="mt-1 flex justify-end text-[10px] tabular-nums text-[#89887f]">{prompt.length}/6000</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept={INPUT_ACCEPT} className="sr-only" aria-label="Attach one supported file" onChange={event => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || recording} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#b89a5a]/40 px-3 text-xs font-semibold text-[#e4d3a8] hover:bg-[#b89a5a]/10 disabled:opacity-45"><Paperclip size={14} />Attach one file</button>
          {!recording
            ? <button type="button" onClick={() => void startRecording()} disabled={busy || !!attachment || recordPermissionPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#5f7866]/60 px-3 text-xs font-semibold text-[#c8dbc8] hover:bg-[#5f7866]/15 disabled:opacity-45"><Mic size={14} />{recordPermissionPending ? 'Waiting for microphone…' : 'Record voice'}</button>
            : <><button type="button" onClick={() => { recorderRef.current?.stop(); setRecording(false); stopTracks(); clearRecordingTimer(); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#b89a5a]/45 px-3 text-xs font-semibold text-[#ead8a5]"><Square size={13} />Stop · {recordSeconds}s / 60s</button><button type="button" onClick={() => { stopRecorder(true); setRecordSeconds(0); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#a65e48]/40 px-3 text-xs text-[#e8b5a4]"><X size={14} />Cancel recording</button></>}
          <span className="inline-flex min-h-10 items-center text-[10px] text-[#aaa9a2]">8 MiB max · text files 128 KiB max</span>
        </div>
        {recordPermissionPending && <p role="status" className="text-[10px] text-[#d5bf80]">Waiting for microphone permission. Reset can discard a late permission grant.</p>}
        {attachment && (
          <div className="rounded-xl border border-white/[.09] bg-[#0d100e] p-3">
            <div className="flex items-start gap-3">
              {isImage && previewUrl ? <img src={previewUrl} alt={`Preview of ${attachment.name}`} className="h-20 w-24 rounded-lg object-cover" /> :
                isVideo && previewUrl ? <video src={previewUrl} controls playsInline preload="metadata" className="h-20 w-32 rounded-lg bg-black object-contain" aria-label={`Preview video ${attachment.name}`} /> :
                  isAudio && previewUrl ? <div className="min-w-0 flex-1"><FileAudio2 size={20} className="mb-2 text-[#d5bf80]" /><audio src={previewUrl} controls preload="metadata" className="w-full" aria-label={`Preview audio ${attachment.name}`} /></div> :
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#b89a5a]/10 text-[#d5bf80]">{attachment.type === 'application/pdf' ? <FileText size={19} /> : <FileText size={19} />}</div>}
              <div className="min-w-0 flex-1">
                <p className="break-all text-xs font-semibold text-[#e7e3d7]">{attachment.name}</p>
                <p className="mt-1 text-[10px] text-[#aaa9a2]">{attachment.type || 'File'} · {formatSize(attachment.size)}</p>
                {isVideo && <p className="mt-1 text-[10px] leading-relaxed text-[#d5bf80]">Only the first 60 seconds of video are analyzed.</p>}
              </div>
              <button type="button" aria-label="Remove attachment" onClick={() => { setSelectedFile(null); if (inputRef.current) inputRef.current.value = ''; }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#bdb9ac] hover:bg-white/[.08]"><X size={15} /></button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[#b89a5a]/20 bg-[#b89a5a]/[.045] p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#b89a5a]/30 bg-[#b89a5a]/10 text-[#d5bf80]"><MapPin size={14} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-[#e4d3a8]">Optional location context</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-[#bdb9ac]">Location is never requested automatically. Your choice is sent only when you explicitly send this question.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={acquireGps} className="min-h-9 rounded-lg border border-[#b89a5a]/35 px-2.5 text-[10px] font-medium text-[#e4d3a8] hover:bg-[#b89a5a]/10">Use GPS once</button>
                <button type="button" onClick={() => void acquireIp()} className="min-h-9 rounded-lg border border-[#b89a5a]/35 px-2.5 text-[10px] font-medium text-[#e4d3a8] hover:bg-[#b89a5a]/10">Approximate by IP</button>
                {location && <button type="button" onClick={() => { locationGenerationRef.current += 1; setLocation(null); setLocationStatus('Location removed.'); }} className="min-h-9 rounded-lg border border-white/[.12] px-2.5 text-[10px] text-[#c6c4bc]">Remove location</button>}
              </div>
              {location && (
                <div className="mt-2 space-y-1.5">
                  <p className="break-words text-[10px] text-[#d5bf80]">
                    {location.kind === 'ip' ? 'Approximate area' : 'GPS location'}
                    {location.kind === 'gps' && typeof location.accuracyMeters === 'number' ? ` · reported accuracy ±${Math.round(location.accuracyMeters)} m` : ''}
                    {' · '}{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                  {sharedLocationUrl && <a href={sharedLocationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 text-[10px] font-medium text-[#e4d3a8] underline underline-offset-2">
                    {location.kind === 'ip' ? 'View approximate area on Nanivio map' : 'View shared location on Nanivio map'}
                  </a>}
                </div>
              )}
              {locationStatus && <p role="status" className="mt-2 text-[10px] leading-relaxed text-[#c6c4bc]">{locationStatus}</p>}
              <p className="mt-2 text-[10px] leading-relaxed text-[#89887f]">IP lookup sends your public IP to ipwho.is. It can be inaccurate or affected by a VPN; it is never used to route you.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[.08] bg-[#10130f] p-3.5">
          <h3 className="text-xs font-semibold text-[#e4d3a8]">Travel planning · Nanivio map</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-[#aaa9a2]">Enter a destination and optional origin. Malvi does not invent a route, travel time, or traffic conditions.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] text-[#bdb9ac]">Destination<input value={destination} onChange={event => setDestination(event.target.value)} maxLength={180} placeholder="City, address, or place" className="mt-1 min-h-10 w-full rounded-lg border border-[#514e43] bg-[#0c100e] px-3 text-xs text-[#f0eee7] placeholder:text-[#85857f] focus:border-[#b89a5a] focus:outline-none" /></label>
            <label className="text-[10px] text-[#bdb9ac]">Origin (optional)<input value={origin} onChange={event => setOrigin(event.target.value)} maxLength={180} placeholder={location ? 'Or use selected shared location' : 'Enter an origin'} className="mt-1 min-h-10 w-full rounded-lg border border-[#514e43] bg-[#0c100e] px-3 text-xs text-[#f0eee7] placeholder:text-[#85857f] focus:border-[#b89a5a] focus:outline-none" /></label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={directionsUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!directionsUrl} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[10px] font-semibold ${directionsUrl ? 'bg-[#d4bd7d] text-[#171918] hover:bg-[#e2d09f]' : 'pointer-events-none border border-white/[.08] text-[#77776f]'}`}><Navigation size={13} />Driving directions</a>
            <a href={mapSearchUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!mapSearchUrl} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-semibold ${mapSearchUrl ? 'border-[#b89a5a]/40 text-[#e4d3a8] hover:bg-[#b89a5a]/10' : 'pointer-events-none border-white/[.08] text-[#77776f]'}`}><MapPin size={13} />Search map</a>
          </div>
        </div>

        <div className="rounded-xl border border-[#66816f]/25 bg-[#66816f]/[.06] p-3">
          <p className="text-[11px] font-semibold text-[#cfdfd0]">Before sending</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#b8c3b7]">With your consent, Nanivio sends your selected content to connected AI services for analysis; their retention policies apply. Raw files and GPS are not saved in browser history. If memory is enabled, eligible text may be saved; location exchanges are excluded.</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[11px] leading-relaxed text-[#e0ded6]">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#b89a5a]" />
            <span>I understand and explicitly consent to send this request and selected context to the AI provider.</span>
          </label>
        </div>
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#a65e48]/35 bg-[#542d25]/20 px-3 py-2.5 text-xs leading-relaxed text-[#e8b5a4]"><AlertCircle size={15} className="mt-0.5 shrink-0" />{malviPublicCopy(error)}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={reset} disabled={busy || recording} className="min-h-11 rounded-xl border border-white/[.12] px-4 text-xs font-semibold text-[#c6c4bc] hover:bg-white/[.06] disabled:opacity-45">Clear draft</button>
          {busy && <button type="button" onClick={() => {
            generationRef.current += 1;
            requestRef.current?.abort();
            requestRef.current = null;
            setBusy(false);
            setError('Request cancelled. Your draft is still here.');
          }} className="min-h-11 rounded-xl border border-[#a65e48]/45 px-4 text-xs font-semibold text-[#e8b5a4] hover:bg-[#542d25]/25">Cancel request</button>}
          <button type="submit" disabled={busy || recording || recordPermissionPending || !consent || (!prompt.trim() && !attachment)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4bd7d] px-5 text-xs font-bold text-[#171918] transition-colors hover:bg-[#e2d09f] disabled:cursor-not-allowed disabled:opacity-45">
            {busy ? <><LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" />Sending securely…</> : <><Send size={14} />Send to AI</>}
          </button>
        </div>
        {busy && <p role="status" className="text-center text-[10px] text-[#aaa9a2]">Waiting for Malvi’s response. Use Cancel request to stop waiting; provider processing may already be underway.</p>}
      </form>
      <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
        <section aria-label="Search licensed media" className="rounded-2xl border border-white/[.09] bg-[#10130f] p-3.5">
          <h3 className="text-xs font-semibold text-[#e4d3a8]">Browse licensed public media</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-[#aaa9a2]">Search Wikimedia Commons images or videos without sending an AI analysis request. Each result includes source and license details.</p>
          <form onSubmit={event => { event.preventDefault(); void searchMedia(mediaQuery.trim(), 'images'); }} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="malvi-workspace-media-query">Media search topic</label>
            <input id="malvi-workspace-media-query" value={mediaQuery} maxLength={180} minLength={3} onChange={event => setMediaQuery(event.target.value)}
              placeholder="Search a place, object, or topic" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#514e43] bg-[#0c100e] px-3 text-xs text-[#f0eee7] placeholder:text-[#89887f] focus:border-[#b89a5a] focus:outline-none" />
            <div className="flex gap-2">
              <button type="button" disabled={mediaLoading || mediaQuery.trim().length < 3} onClick={() => void searchMedia(mediaQuery.trim(), 'images')} className="min-h-10 flex-1 rounded-lg border border-[#b89a5a]/40 px-3 text-xs text-[#e4d3a8] disabled:opacity-45">Images</button>
              <button type="button" disabled={mediaLoading || mediaQuery.trim().length < 3} onClick={() => void searchMedia(mediaQuery.trim(), 'videos')} className="min-h-10 flex-1 rounded-lg border border-[#b89a5a]/40 px-3 text-xs text-[#e4d3a8] disabled:opacity-45">Videos</button>
            </div>
          </form>
          {mediaLoading && <p role="status" className="mt-2 text-xs text-[#d5bf80]">Searching licensed public media…</p>}
          {mediaError && <p role="alert" className="mt-2 rounded-lg border border-[#a65e48]/35 px-3 py-2 text-xs text-[#e8b5a4]">{malviPublicCopy(mediaError)}</p>}
        </section>
        {mediaItems.length > 0 && <MalviAssetResults media={mediaItems} limitation={mediaNotice} />}
        {!mediaLoading && !mediaError && mediaNotice && mediaItems.length === 0 && <p role="status" className="text-[10px] leading-relaxed text-[#aaa9a2]">{mediaNotice}</p>}
        {incomingAssets && <MalviAssetResults {...incomingAssets} />}
        {result && <MalviResultPanel result={result} />}
      </div>
    </section>
  );
};
