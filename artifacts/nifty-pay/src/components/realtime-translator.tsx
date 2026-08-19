import { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Square, X } from 'lucide-react';
import { useAgoraCall } from '@/contexts/agora-call';
import { API_BASE as API } from '@/lib/api';
import { PcmCapture } from '@/lib/translator/pcm-capture';
import { RealtimeTranslator, type TranslatorStatus } from '@/lib/translator/realtime-translator';

function translatorSocketUrl(token: string) {
  const origin = API.replace(/\/api$/, '').replace(/^http/, 'ws');
  return `${origin}/api/translator/ws?token=${encodeURIComponent(token)}`;
}

/** Controls the existing Palabra speech-to-speech pipeline for the active Agora call. */
export function RealtimeTranslatorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    activeCall, remoteJoined, getMicrophoneTrack, publishTranslatedAudio, unpublishTranslatedAudio,
    setOriginalMicMuted,
  } = useAgoraCall();
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [pairedEnabled, setPairedEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<TranslatorStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const translatorRef = useRef<RealtimeTranslator | null>(null);
  const captureRef = useRef<PcmCapture | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const stop = useCallback(async () => {
    captureRef.current?.stop();
    captureRef.current = null;
    translatorRef.current?.disconnect();
    translatorRef.current = null;
    await unpublishTranslatedAudio();
    await setOriginalMicMuted(false);
    await audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setStatus('idle');
  }, [setOriginalMicMuted, unpublishTranslatedAudio]);

  const start = useCallback(async (language = targetLanguage) => {
    if (!activeCall || translatorRef.current) return;
    const microphone = getMicrophoneTrack();
    if (!microphone) {
      setError('Your microphone is unavailable for translation.');
      return;
    }
    setError('');
    setStatus('connecting');
    try {
      const tokenResponse = await fetch(`${API}/translator/session`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('nanivio_token')}` },
      });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error ?? 'Could not start translation');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext: AudioContext = new AudioContextClass({ sampleRate: 24000 });
      const destination = audioContext.createMediaStreamDestination();
      audioContextRef.current = audioContext;
      const outputTrack = destination.stream.getAudioTracks()[0];
      if (!outputTrack) throw new Error('Could not prepare translated audio');
      await publishTranslatedAudio(outputTrack);
      await setOriginalMicMuted(true);

      const translator = new RealtimeTranslator({ sourceLanguage: 'auto', targetLanguage: language, enabled: true });
      translatorRef.current = translator;
      translator.on((event) => {
        if (event.type === 'status') setStatus((event.message as TranslatorStatus) ?? 'connected');
        if (event.type === 'transcript' && event.text) setTranscript(event.text);
        if (event.type === 'translation' && event.text) setTranslation(event.text);
        if (event.type === 'error') setError(event.message ?? 'Translation failed');
        if (event.type === 'audio' && event.audio && audioContextRef.current) {
          const pcm = new Int16Array(event.audio);
          const buffer = audioContextRef.current.createBuffer(1, pcm.length, 24000);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;
          const source = audioContextRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          source.start();
        }
      });
      await translator.connect(translatorSocketUrl(tokenData.token));
      const capture = new PcmCapture();
      captureRef.current = capture;
      await capture.start((pcm) => translator.sendAudio(pcm), microphone);
    } catch (caught: any) {
      setError(caught?.message ?? 'Could not start translation');
      await stop();
    }
  }, [activeCall, getMicrophoneTrack, publishTranslatedAudio, setOriginalMicMuted, stop, targetLanguage]);

  useEffect(() => () => { void stop(); }, [stop]);
  useEffect(() => {
    if (!activeCall || !remoteJoined) {
      setPairedEnabled(null);
      void stop();
      return;
    }
    let cancelled = false;
    const configurePairedInterpretation = async () => {
      try {
        const response = await fetch(`${API}/agora/translation?chatId=${encodeURIComponent(activeCall.chatId)}&otherUserId=${encodeURIComponent(activeCall.otherUserId)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('nanivio_token')}` },
        });
        const config = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(config.error ?? 'Could not load call translation preferences');
        if (cancelled) return;
        setPairedEnabled(!!config.enabled);
        if (!config.enabled) {
          await stop();
          return;
        }
        setTargetLanguage(config.targetLanguage);
        await start(config.targetLanguage);
      } catch (caught: any) {
        if (!cancelled) {
          setPairedEnabled(false);
          setError(caught?.message ?? 'Could not start paired interpretation');
          await stop();
        }
      }
    };
    void configurePairedInterpretation();
    return () => { cancelled = true; };
  }, [activeCall?.channel, remoteJoined, start, stop]);

  if (!open) return null;
  const active = status !== 'idle';

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/45 p-4 sm:items-center sm:justify-center">
      <section className="w-full rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl sm:max-w-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Languages className="h-5 w-5 text-emerald-400" /><h2 className="font-bold">Live voice translator</h2></div>
          <button onClick={onClose} aria-label="Close translator" className="rounded-full p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-2 text-sm text-white/60">When both people turn on Live Translation in Account, each voice is detected automatically and delivered in the other person's preferred language.</p>
        <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm">
          {pairedEnabled === null && <p className="text-white/60">Checking both participants’ preferences…</p>}
          {pairedEnabled === false && <p className="text-amber-200">Both participants must enable Live Translation in Account to interpret this call.</p>}
          {pairedEnabled && <p className="text-emerald-200">Live interpretation is on. The other participant hears you in their selected language.</p>}
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {(transcript || translation) && <div className="mt-4 space-y-2 rounded-2xl bg-white/5 p-3 text-sm"><p className="text-white/60">{transcript || 'Listening…'}</p><p className="font-medium text-emerald-200">{translation}</p></div>}
        {active && <button onClick={() => void stop()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-bold hover:bg-red-600"><Square className="h-4 w-4" /> Stop translation</button>}
      </section>
    </div>
  );
}
