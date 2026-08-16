import { useEffect, useRef, useState } from 'react';
import { Languages, Mic, MicOff, Volume2, X } from 'lucide-react';
import { PcmCapture } from '@/lib/translator/pcm-capture';
import { useAgoraCall } from '@/contexts/agora-call';
import {
  RealtimeTranslator,
  type TranslatorEvent,
  type TranslatorStatus,
} from '@/lib/translator/realtime-translator';

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('nanivio_token') ?? ''}`,
  };
}

function getWebSocketUrl(token: string) {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  if (apiUrl) {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/translator/ws';
    url.search = `?token=${encodeURIComponent(token)}`;
    return url.toString();
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/translator/ws?token=${encodeURIComponent(token)}`;
}

function playPcmAudio(audio: ArrayBuffer, sampleRate = 24000) {
  const pcm = new Int16Array(audio);
  if (!pcm.length) return;

  const context = new AudioContext();
  const buffer = context.createBuffer(1, pcm.length, sampleRate);
  buffer.getChannelData(0).set(Array.from(pcm).map(v => v / 32768));

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

export function RealtimeTranslatorPanel({ open, onClose }: RealtimeTranslatorProps) {
  const { getMicrophoneTrack, activeCall } = useAgoraCall() as any;
  const translatorRef = useRef<RealtimeTranslator | null>(null);
  const captureRef = useRef<PcmCapture | null>(null);

  const [status, setStatus] = useState<TranslatorStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!open) return;
    return () => {
      stop();
    };
  }, [open]);

  const start = async () => {
    try {
      setError('');
      setTranscript('');
      setTranslation('');
      setStatus('connecting');

      // Fetch global preference saved from the account config profile
      const storedPreference = localStorage.getItem('nanivio_preferred_language') || 'en';

      const sessionResponse = await fetch(`${API}/api/translator/session`, {
        headers: authHeaders(),
      });
      const session = await sessionResponse.json();

      if (!sessionResponse.ok || !session?.token) {
        throw new Error(session?.error ?? 'Unable to create translator session');
      }

      // Automatically apply preference state silently behind the scenes
      const translator = new RealtimeTranslator({
        sourceLanguage: 'auto',
        targetLanguage: storedPreference,
        enabled: true,
      });
      translatorRef.current = translator;

      translator.on((event: TranslatorEvent) => {
        switch (event.type) {
          case 'status':
            setStatus((event.message ?? 'connected') as TranslatorStatus);
            break;
          case 'transcript':
            if (event.text) setTranscript(event.text);
            break;
          case 'translation':
            if (event.text) setTranslation(event.text);
            break;
          case 'audio':
            if (event.audio) {
              playPcmAudio(event.audio, 24000);
            }
            break;
          case 'error':
            setError(event.message ?? 'Translator error');
            setStatus('error');
            break;
        }
      });

      await translator.connect(getWebSocketUrl(session.token));
      const capture = new PcmCapture();
      captureRef.current = capture;

      let targetTrack: MediaStreamTrack | undefined = undefined;

      // Automatically capture friend's active audio track without prompts
      const remoteUser = activeCall?.remoteUser;
      const remoteAudioTrack = remoteUser?.audioTrack;
      
      if (remoteAudioTrack) {
        targetTrack = remoteAudioTrack.getMediaStreamTrack();
        remoteAudioTrack.setVolume(0); 
      } else {
        targetTrack = getMicrophoneTrack()?.getMediaStreamTrack() ?? undefined;
      }

      await capture.start((pcm) => {
        const sent = translator.sendAudio(pcm);
        if (sent) setSpeaking(true);
      }, targetTrack);

      setStatus('speaking');
    } catch (e: any) {
      console.error('[translator] start failed:', e);
      stop();
      setStatus('error');
      setError(e?.message ?? 'Unable to start translator');
    }
  };

  const stop = () => {
    captureRef.current?.stop();
    captureRef.current = null;

    translatorRef.current?.disconnect();
    translatorRef.current = null;

    const remoteAudioTrack = activeCall?.remoteUser?.audioTrack;
    if (remoteAudioTrack) {
      remoteAudioTrack.setVolume(100);
    }

    setSpeaking(false);
    setStatus('idle');
  };

  if (!open) return null;
  const running = status !== 'idle' && status !== 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-background border shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Simplified Automatic Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Languages className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold">Live Translation</h2>
              <p className="text-xs text-muted-foreground">Automated call translation active</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Transcript Bubble Display */}
        {(transcript || translation) && (
          <div className="rounded-2xl bg-muted/40 border p-4 space-y-3 max-h-48 overflow-y-auto">
            {transcript && (
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Incoming Speech</div>
                <p className="text-sm mt-0.5">{transcript}</p>
              </div>
            )}
            {translation && (
              <div className="pt-2 border-t border-dashed">
                <div className="text-[10px] uppercase font-bold text-primary tracking-wider">Translated Audio</div>
                <p className="text-sm font-medium text-primary mt-0.5">{translation}</p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive text-center font-medium">{error}</p>}

        {/* Simple Control Action */}
        <div className="flex justify-center pt-2">
          {running ? (
            <button onClick={stop} className="flex items-center gap-2 px-6 py-3 rounded-full bg-destructive text-white hover:bg-destructive/90 font-medium transition shadow-md">
              <MicOff className="w-4 h-4" /> Stop Translation
            </button>
          ) : (
            <button onClick={start} className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white hover:bg-primary/90 font-medium transition shadow-md">
              <Mic className="w-4 h-4" /> Start Translation
            </button>
          )}
        </div>

        {speaking && (
          <div className="flex justify-center gap-1 items-center text-xs text-muted-foreground animate-pulse">
            <Volume2 className="w-3.5 h-3.5 text-primary" /> Stream processing optimized...
          </div>
        )}
      </div>
    </div>
  );
}
