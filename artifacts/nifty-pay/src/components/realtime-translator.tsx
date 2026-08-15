import { useEffect, useRef, useState } from 'react';
import { Languages, Mic, MicOff, Volume2, X } from 'lucide-react';
import { PcmCapture } from '@/lib/translator/pcm-capture';
import { useAgoraCall } from '@/contexts/agora-call';
import {
  RealtimeTranslator,
  type TranslatorEvent,
  type TranslatorStatus,
} from '@/lib/translator/realtime-translator';

const API =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const LANGUAGES = [
  { value: 'auto', label: 'Auto detect' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('nanivio_token') ?? ''}`,
  };
}

function getWebSocketUrl(token: string) {
  const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ?? '';

  if (apiUrl) {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/translator/ws';
    url.search = `?token=${encodeURIComponent(token)}`;
    return url.toString();
  }

  const protocol =
    window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${protocol}//${window.location.host}/api/translator/ws?token=${encodeURIComponent(token)}`;
}

function playPcmAudio(
  audio: ArrayBuffer,
  sampleRate = 24000,
) {
  const pcm = new Int16Array(audio);

  if (!pcm.length) return;

  const context = new AudioContext();

  const buffer = context.createBuffer(
    1,
    pcm.length,
    sampleRate,
  );

  const channel = buffer.getChannelData(0);

  for (let i = 0; i < pcm.length; i++) {
    channel[i] = pcm[i] / 32768;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  source.onended = () => {
    void context.close().catch(() => {});
  };

  void context.resume().catch(() => {});
  source.start();
}

interface RealtimeTranslatorProps {
  open: boolean;
  onClose: () => void;
}

export function RealtimeTranslatorPanel({
  open,
  onClose,
}: RealtimeTranslatorProps) {
  const { getMicrophoneTrack } = useAgoraCall();

  const translatorRef = useRef<RealtimeTranslator | null>(null);
  const captureRef = useRef<PcmCapture | null>(null);

  const [status, setStatus] =
    useState<TranslatorStatus>('idle');

  const [sourceLanguage, setSourceLanguage] =
    useState('auto');

  const [targetLanguage, setTargetLanguage] =
    useState('en');

  const [transcript, setTranscript] =
    useState('');

  const [translation, setTranslation] =
    useState('');

  const [error, setError] =
    useState('');

  const [speaking, setSpeaking] =
    useState(false);

  useEffect(() => {
    if (!open) return;

    return () => {
      captureRef.current?.stop();
      captureRef.current = null;

      translatorRef.current?.disconnect();
      translatorRef.current = null;
    };
  }, [open]);

  const start = async () => {
    try {
      setError('');
      setTranscript('');
      setTranslation('');

      setStatus('connecting');

      const sessionResponse = await fetch(
        `${API}/api/translator/session`,
        {
          headers: authHeaders(),
        },
      );

      const session = await sessionResponse.json();

      if (
        !sessionResponse.ok ||
        !session?.token
      ) {
        throw new Error(
          session?.error ??
            'Unable to create translator session',
        );
      }

      const translator =
        new RealtimeTranslator({
          sourceLanguage,
          targetLanguage,
          enabled: true,
        });

      translatorRef.current = translator;

      translator.on((event: TranslatorEvent) => {
        switch (event.type) {
          case 'status':
            setStatus(
              (event.message ??
                'connected') as TranslatorStatus,
            );
            break;

          case 'transcript':
            if (event.text) {
              setTranscript(event.text);
            }
            break;

          case 'translation':
            if (event.text) {
              setTranslation(event.text);
            }
            break;

          case 'audio':
            if (event.audio) {
              playPcmAudio(event.audio, 24000);
            }
            break;

          case 'error':
            setError(
              event.message ??
                'Translator error',
            );
            setStatus('error');
            break;
        }
      });

      await translator.connect(
        getWebSocketUrl(session.token),
      );

      const capture = new PcmCapture();

      captureRef.current = capture;

      const existingMicrophoneTrack =
        getMicrophoneTrack();

      await capture.start(
        (pcm) => {
          const sent =
            translator.sendAudio(pcm);

          if (sent) {
            setSpeaking(true);
          }
        },
        existingMicrophoneTrack ?? undefined,
      );

      setStatus('speaking');
    } catch (e: any) {
      console.error(
        '[translator] start failed:',
        e,
      );

      captureRef.current?.stop();
      captureRef.current = null;

      translatorRef.current?.disconnect();
      translatorRef.current = null;

      setStatus('error');

      setError(
        e?.message ??
          'Unable to start translator',
      );
    }
  };

  const stop = () => {
    captureRef.current?.stop();
    captureRef.current = null;

    translatorRef.current?.disconnect();
    translatorRef.current = null;

    setSpeaking(false);
    setStatus('idle');
  };

  const changeLanguages = (
    source: string,
    target: string,
  ) => {
    setSourceLanguage(source);
    setTargetLanguage(target);

    translatorRef.current?.setLanguages(
      source,
      target,
    );
  };

  if (!open) return null;

  const running =
    status !== 'idle' &&
    status !== 'error';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-background border shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Languages className="w-5 h-5 text-primary" />
            </div>

            <div>
              <h2 className="font-bold">
                Live Translator
              </h2>

              <p className="text-xs text-muted-foreground">
                Real-time voice translation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center"
            aria-label="Close translator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Languages */}
        <div className="p-5 space-y-4">

          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                You speak
              </span>

              <select
                value={sourceLanguage}
                onChange={(e) =>
                  changeLanguages(
                    e.target.value,
                    targetLanguage,
                  )
                }
                disabled={running}
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                {LANGUAGES.map(
                  (language) => (
                    <option
                      key={language.value}
                      value={language.value}
                    >
                      {language.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <Languages className="w-5 h-5 mb-2 text-muted-foreground" />

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Translate to
              </span>

              <select
                value={targetLanguage}
                onChange={(e) =>
                  changeLanguages(
                    sourceLanguage,
                    e.target.value,
                  )
                }
                disabled={running}
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                {LANGUAGES
                  .filter(
                    (language) =>
                      language.value !== 'auto',
                  )
                  .map(
                    (language) => (
                      <option
                        key={language.value}
                        value={language.value}
                      >
                        {language.label}
                      </option>
                    ),
                  )}
              </select>
            </label>
          </div>

          {/* Status */}
          <div className="rounded-2xl bg-muted/50 px-4 py-3 flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'error'
                  ? 'bg-red-500'
                  : running
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-muted-foreground/40'
              }`}
            />

            <span className="text-sm capitalize">
              {status === 'speaking'
                ? 'Listening…'
                : status}
            </span>
          </div>

          {/* Transcript */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              You said
            </p>

            <div className="min-h-[70px] rounded-2xl border p-4 text-sm">
              {transcript ||
                'Your speech will appear here…'}
            </div>
          </div>

          {/* Translation */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Translation
            </p>

            <div className="min-h-[70px] rounded-2xl bg-primary/5 border border-primary/10 p-4 text-sm">
              {translation ||
                'Translation will appear here…'}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center pt-2">
            {!running ? (
              <button
                onClick={() => void start()}
                className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                aria-label="Start translator"
              >
                <Mic className="w-7 h-7" />
              </button>
            ) : (
              <button
                onClick={stop}
                className={`w-16 h-16 rounded-full ${
                  speaking
                    ? 'bg-red-500'
                    : 'bg-muted'
                } text-white flex items-center justify-center shadow-lg`}
                aria-label="Stop translator"
              >
                {speaking ? (
                  <MicOff className="w-7 h-7" />
                ) : (
                  <Volume2 className="w-7 h-7" />
                )}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Your microphone is only used while
            translation is active.
          </p>
        </div>
      </div>
    </div>
  );
}
