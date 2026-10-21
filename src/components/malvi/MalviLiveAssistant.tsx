import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Mic, MicOff, Video } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { assistantRequest, deliverMalviAudio, parseMalviReferenceCitations, type MalviReferenceCitation, type LiveAvatarReadiness } from '../../lib/malviLiveClient';
import { startLocalMalviWakeWord, installLocalMalviWakeWordPack, LocalWakeWordError } from '../../lib/localMalviWakeWord';
import { getMalviLanguage, MALVI_LANGUAGES, malviLanguageCoverage } from '../../lib/malviLanguages';
import { realtimeClient } from '../../lib/realtimeClient';
import { MalviLiveOverlay } from './MalviLiveOverlay';
import type { LiveAvatarSession } from '@heygen/liveavatar-web-sdk';
import { MalviVoicePlayback } from '../../lib/malviVoicePlayback';

type Phase = 'idle' | 'connecting' | 'connected' | 'error';
interface LiveControls {
  readiness: LiveAvatarReadiness | null;
  notice: string;
  phase: Phase;
  wakeArmed: boolean;
  wakeChecking: boolean;
  wakePackRequired: boolean;
  wakePackInstalling: boolean;
  installWakePack: () => Promise<void>;
  start: (activation: 'manual' | 'wake-word') => Promise<void>;
  startVoiceTest: () => Promise<void>;
  armWake: () => Promise<void>;
  disarmWake: () => void;
  refresh: () => Promise<void>;
}
const LiveContext = createContext<LiveControls | null>(null);

export const MalviLiveAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, appLanguage } = useNanivio();
  const preferredLanguage = appLanguage || currentUser?.appLanguage || currentUser?.myLanguage || 'en';
  const languageRef = useRef(preferredLanguage);
  languageRef.current = preferredLanguage;
  const [readiness, setReadiness] = useState<LiveAvatarReadiness | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [brainReady, setBrainReady] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const [referenceStatus, setReferenceStatus] = useState('idle');
  const [references, setReferences] = useState<MalviReferenceCitation[]>([]);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [wakeArmed, setWakeArmed] = useState(false);
  const [wakeChecking, setWakeChecking] = useState(false);
  const [wakePackRequired, setWakePackRequired] = useState(false);
  const [wakePackInstalling, setWakePackInstalling] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [voiceOnly, setVoiceOnly] = useState(false);
  const voiceMode = useRef(false);
  const playback = useRef<MalviVoicePlayback | null>(null);
  const pendingAudio = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaReady = useRef(false);
  const sdk = useRef<LiveAvatarSession | null>(null);
  const sessionId = useRef<string | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const micContext = useRef<AudioContext | null>(null);
  const micSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessor = useRef<AudioWorkletNode | null>(null);
  const stopWake = useRef<(() => void) | null>(null);
  const wakeController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const deadline = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const stopMicrophone = useCallback(() => {
    const id = sessionId.current;
    if (id) realtimeClient.send('malvi:brain_audio_end', { sessionId: id });
    micProcessor.current?.disconnect();
    micSource.current?.disconnect();
    micStream.current?.getTracks().forEach((track) => track.stop());
    if (micContext.current && micContext.current.state !== 'closed') void micContext.current.close();
    micProcessor.current = null;
    micSource.current = null;
    micStream.current = null;
    micContext.current = null;
    setMicrophoneOn(false);
  }, []);
  const disarmWake = useCallback(() => {
    wakeController.current?.abort(); wakeController.current = null;
    stopWake.current?.(); stopWake.current = null; setWakeArmed(false);
    setWakeChecking(false);
  }, []);

  const cleanup = useCallback(async () => {
    const live = sdk.current, id = sessionId.current;
    stopMicrophone();
    playback.current?.close(); playback.current = null; pendingAudio.current = null;
    if (id) realtimeClient.send('malvi:brain_stop', { sessionId: id });
    sdk.current = null; sessionId.current = null; deadline.current = 0; mediaReady.current = false;
    setActiveLanguage(null);
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    await Promise.allSettled([
      live ? live.stop() : Promise.resolve(),
      id ? assistantRequest(`/session/${id}/end`, {}, true) : Promise.resolve(),
    ]);
  }, [stopMicrophone]);

  const close = useCallback(() => {
    generation.current++; busy.current = false; disarmWake();
    void cleanup();
    setPhase('idle'); setError(null); setAudioBlocked(false); setBrainReady(false);
  }, [cleanup, disarmWake]);
  const fail = useCallback((message: string) => {
    generation.current++; busy.current = false; void cleanup();
    if (mounted.current) { setError(message); setPhase('error'); }
  }, [cleanup]);
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video || !sdk.current || !mediaReady.current) return;
    try {
      sdk.current.attach(video);
      void video.play().catch(() => setAudioBlocked(true));
    } catch (error) {
      fail(error instanceof Error ? error.message : 'The live video could not be attached.');
    }
  }, [fail]);
  const refresh = useCallback(async () => {
    try { setReadiness(await assistantRequest('/status')); setNotice(''); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Live avatar readiness is unavailable.'); }
  }, []);
  useEffect(() => {
    const isCurrent = (payload: any) => Boolean(payload?.sessionId && payload.sessionId === sessionId.current);
    const offReady = realtimeClient.on('malvi:brain_ready', (payload) => {
      if (isCurrent(payload)) {
        setActiveLanguage(payload.language || languageRef.current);
        setBrainReady(true);
        if (voiceMode.current) setPhase('connected');
        setCaption(`Malvi is ready using ${payload.provider === 'openai' ? 'OpenAI GPT-Live' : 'Gemini Live'}. Turn on the microphone when you’re ready.`);
      }
    });
    const offAudio = realtimeClient.on('malvi:brain_audio', (payload) => {
      if (!isCurrent(payload) || (payload.language && payload.language !== languageRef.current)) return;
      try {
        if (voiceMode.current && playback.current) {
          deliverMalviAudio({ repeatAudio: audio => {
            void playback.current?.play(audio).catch(() => {
              if (isCurrent(payload)) { pendingAudio.current = audio; setAudioBlocked(true); }
            });
          } }, payload);
        } else if (sdk.current) deliverMalviAudio(sdk.current, payload);
        else return;
        if (payload.greeting) setCaption('Malvi is ready to talk. Turn on the microphone when you’re ready.');
      } catch {
        setMicrophoneError('Malvi’s voice audio could not be played.');
      }
    });
    const offCaption = realtimeClient.on('malvi:brain_caption', (payload) => {
      if (isCurrent(payload) && (!payload.language || payload.language === languageRef.current) && typeof payload.text === 'string') setCaption(payload.text);
    });
    const offActivity = realtimeClient.on('malvi:brain_activity', (payload) => {
      if (isCurrent(payload) && Number.isFinite(payload.idleDeadline)) deadline.current = payload.idleDeadline;
    });
    const offSources = realtimeClient.on('malvi:brain_sources', (payload) => {
      if (!isCurrent(payload)) return;
      if (['searching', 'complete', 'empty', 'unavailable'].includes(payload.status)) setReferenceStatus(payload.status);
      setReferences(parseMalviReferenceCitations(payload.results));
      setUnavailableSources(Array.isArray(payload.unavailable)
        ? payload.unavailable.filter((source: unknown) => ['Wikipedia', 'Wikidata', 'arXiv', 'PubMed'].includes(String(source)))
        : []);
    });
    const offError = realtimeClient.on('malvi:brain_error', (payload) => {
      if (isCurrent(payload) && typeof payload.message === 'string') {
        fail(payload.message);
      }
    });
    const offInterrupted = realtimeClient.on('malvi:brain_interrupted', payload => {
      if (isCurrent(payload)) { playback.current?.interrupt(); pendingAudio.current = null; sdk.current?.interrupt(); }
    });
    const offLanguage = realtimeClient.on('malvi:brain_language', payload => {
      if (!isCurrent(payload) || typeof payload.language !== 'string') return;
      setActiveLanguage(payload.language);
      setBrainReady(true);
      const selected = MALVI_LANGUAGES.find(item => item.code === payload.language);
      setCaption(`Malvi’s language preference is now ${selected?.name || payload.language}. Turn on the microphone when ready.`);
    });
    const offLanguageError = realtimeClient.on('malvi:brain_language_error', payload => {
      if (isCurrent(payload)) fail(typeof payload.message === 'string' ? payload.message : 'The selected language could not be applied. Start a new conversation.');
    });
    return () => { offReady(); offAudio(); offCaption(); offActivity(); offSources(); offError(); offLanguage(); offLanguageError(); offInterrupted(); };
  }, [stopMicrophone, fail]);

  useEffect(() => {
    const id = sessionId.current;
    if (!id || !brainReady || !activeLanguage || activeLanguage === preferredLanguage) return;
    try {
      const language = getMalviLanguage(preferredLanguage);
      stopMicrophone();
      sdk.current?.interrupt();
      playback.current?.interrupt(); pendingAudio.current = null;
      setBrainReady(false);
      setCaption(`Applying ${language.name} to Malvi’s conversation…`);
      realtimeClient.send('malvi:brain_language', { sessionId: id, language: language.code });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Choose a valid language for Malvi.');
    }
  }, [preferredLanguage, activeLanguage, brainReady, stopMicrophone, fail]);

  useEffect(() => {
    if (phase !== 'connected' || brainReady || !activeLanguage || activeLanguage === preferredLanguage) return;
    const timer = window.setTimeout(() => fail('Malvi’s language update was not acknowledged. Start a new conversation to use your selected language.'), 12_000);
    return () => window.clearTimeout(timer);
  }, [phase, brainReady, activeLanguage, preferredLanguage, fail]);

  const toggleMicrophone = useCallback(async () => {
    if (microphoneOn) { stopMicrophone(); return; }
    const id = sessionId.current;
    if (!id || !brainReady) return;
    setMicrophoneError('');
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || !('audioWorklet' in AudioContext.prototype)) {
        throw new Error('This browser does not support live microphone streaming.');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      context = new AudioContext({ sampleRate: 16000 });
      if (context.sampleRate !== 16000) throw new Error('This browser could not start a 16 kHz audio stream.');
      await context.resume();
      await context.audioWorklet.addModule('/audio/malvi-pcm-processor.js');
      if (sessionId.current !== id || !mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
        return;
      }
      const source = context.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(context, 'malvi-pcm-processor');
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      processor.port.onmessage = (event) => {
        if (sessionId.current === id && typeof event.data === 'string') {
          realtimeClient.send('malvi:brain_audio', { sessionId: id, audio: event.data });
        }
      };
      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(context.destination);
      micStream.current = stream;
      micContext.current = context;
      micSource.current = source;
      micProcessor.current = processor;
      setMicrophoneOn(true);
      setCaption('Microphone is on. Your speech is sent to the selected Nanivio brain provider.');
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close().catch(() => {});
      micStream.current?.getTracks().forEach((track) => track.stop());
      micContext.current?.close().catch(() => {});
      setMicrophoneError(error instanceof Error ? error.message : 'Microphone access could not start.');
      setMicrophoneOn(false);
    }
  }, [brainReady, microphoneOn, stopMicrophone]);
  useEffect(() => { void refresh(); }, [refresh, currentUser?.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++; busy.current = false;
      wakeController.current?.abort(); wakeController.current = null;
      stopWake.current?.(); stopWake.current = null; void cleanup();
    };
  }, [cleanup, currentUser?.id]);

  const start = useCallback(async (activation: 'manual' | 'wake-word') => {
    if (busy.current || sdk.current || sessionId.current) return;
    voiceMode.current = false; setVoiceOnly(false);
    busy.current = true;
    const run = ++generation.current;
    disarmWake(); setError(null); setCaption('Connecting your live avatar and selected brain provider.');
    setBrainReady(false); setMicrophoneError(''); setMicrophoneOn(false);
    setReferenceStatus('idle'); setReferences([]); setUnavailableSources([]);
    setSecondsRemaining(60); setAudioBlocked(false); setPhase('connecting');
    try {
      // No token exchange, SDK download, WebRTC, or provider audio before activation.
      const language = getMalviLanguage(languageRef.current);
      const info = await assistantRequest('/session', { activation, language: language.code });
      if (run !== generation.current || !mounted.current) {
        await assistantRequest(`/session/${info.id}/end`, {}, true).catch(() => {});
        return;
      }
      sessionId.current = info.id; deadline.current = info.idleDeadline;
      const { LiveAvatarSession, SessionEvent, SessionMode } = await import('@heygen/liveavatar-web-sdk');
      if (run !== generation.current) return;
      const live = new LiveAvatarSession(info.sessionToken, {
        autoKeepAlive: false,
        voiceChat: { defaultMuted: true },
      });
      if (live.mode !== SessionMode.LITE) throw new Error('LiveAvatar returned a non-LITE session. It was not started.');
      // The current official SDK starts VoiceChat even with defaultMuted:true.
      // Disable that public component BEFORE start, so no microphone is opened
      // or published to HeyGen. Our later brain pipeline owns input capture.
      live.voiceChat.start = async () => {};
      sdk.current = live;
      let welcomed = false;
      let streamReady = false, sessionStarted = false;
      const welcome = () => {
        if (!welcomed && streamReady && sessionStarted && run === generation.current) {
          welcomed = true;
          setCaption('Starting Malvi’s selected live brain and language-specific AI greeting.');
          realtimeClient.send('malvi:brain_start', { sessionId: info.id, language: languageRef.current });
        }
      };
      live.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (run !== generation.current) return;
        streamReady = true;
        setPhase('connected');
        setCaption('Live visual session connected. Starting the selected brain provider.');
        mediaReady.current = true;
        attachVideo(videoRef.current);
        welcome();
      });
      live.on(SessionEvent.SESSION_DISCONNECTED, () => {
        if (run === generation.current) {
          setNotice('The live avatar session ended. No automatic reconnection was started.');
          close();
        }
      });
      const starting = live.start().then(async () => {
        if (run !== generation.current) await live.stop();
      });
      let connectionTimeout: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([starting, new Promise<never>((_, reject) => {
          connectionTimeout = setTimeout(() => reject(new Error('The live avatar did not connect within 20 seconds.')), 20_000);
        })]);
      } finally { clearTimeout(connectionTimeout!); }
      // User audio belongs to our backend, not the provider-managed voice chat.
      await live.voiceChat.stop();
      if (run !== generation.current) { await live.stop(); return; }
      sessionStarted = true;
      welcome();
      busy.current = false;
    } catch (err) {
      if (run === generation.current) fail(err instanceof Error ? err.message : 'Unable to connect the live avatar.');
    }
  }, [attachVideo, close, disarmWake, fail]);

  const startVoiceTest = useCallback(async () => {
    if (busy.current || sessionId.current || sdk.current) return;
    busy.current = true;
    const run = ++generation.current;
    voiceMode.current = true; setVoiceOnly(true);
    disarmWake(); setError(null); setBrainReady(false); setActiveLanguage(null);
    setMicrophoneError(''); setMicrophoneOn(false); setAudioBlocked(false);
    setReferences([]); setReferenceStatus('idle'); setUnavailableSources([]);
    setSecondsRemaining(60); setPhase('connecting');
    setCaption('Connecting the selected brain. No avatar session will be started.');
    try {
      // Unlock browser playback within the explicit user gesture, before HTTP.
      playback.current = new MalviVoicePlayback();
      await playback.current.resume();
      if (run !== generation.current) return;
      const language = getMalviLanguage(languageRef.current);
      const info = await assistantRequest('/voice-session', { activation: 'manual', language: language.code });
      if (run !== generation.current || !mounted.current) {
        await assistantRequest(`/session/${info.id}/end`, {}, true).catch(() => {});
        return;
      }
      sessionId.current = info.id; deadline.current = info.idleDeadline;
      realtimeClient.send('malvi:brain_start', { sessionId: info.id, language: language.code });
      busy.current = false;
    } catch (error) {
      if (run === generation.current) fail(error instanceof Error ? error.message : 'The voice-only test could not start.');
    }
  }, [disarmWake, fail]);

  useEffect(() => {
    if (phase !== 'connecting' || !voiceOnly) return;
    const timeout = setTimeout(() => fail('The live brain did not become ready within 20 seconds. The voice-only test was stopped.'), 20_000);
    return () => clearTimeout(timeout);
  }, [phase, voiceOnly, fail]);

  const armWake = useCallback(async () => {
    if (wakeController.current || wakeChecking || wakeArmed || busy.current || sdk.current) return;
    const controller = new AbortController();
    wakeController.current = controller;
    setWakeChecking(true); setNotice('');
    const run = generation.current;
    try {
      const stop = await startLocalMalviWakeWord(
        () => {
          if (controller.signal.aborted || !mounted.current) return;
          wakeController.current = null; stopWake.current = null; setWakeArmed(false); void start('wake-word');
        },
        message => {
          if (controller.signal.aborted || !mounted.current) return;
          wakeController.current = null; stopWake.current = null; setWakeArmed(false); setNotice(message);
        },
        controller.signal,
      );
      if (controller.signal.aborted || run !== generation.current || !mounted.current) { stop(); return; }
      setWakePackRequired(false);
      stopWake.current = stop; setWakeArmed(true);
    } catch (err) {
      if (!controller.signal.aborted && mounted.current) {
        wakeController.current = null;
        setWakePackRequired(err instanceof LocalWakeWordError && err.code === 'PACK_REQUIRED');
        setNotice(err instanceof Error ? err.message : 'On-device wake-word listening is unavailable.');
      }
    } finally { if (mounted.current && !controller.signal.aborted) setWakeChecking(false); }
  }, [start, wakeArmed, wakeChecking]);

  const installWakePack = useCallback(async () => {
    if (wakePackInstalling) return;
    setWakePackInstalling(true);
    try {
      const installed = await installLocalMalviWakeWordPack();
      if (!mounted.current) return;
      setWakePackRequired(!installed);
      setNotice(installed ? 'Local speech pack installed. Tap Enable local wake word to begin listening.' : 'The speech pack could not be installed. You can still start Malvi manually.');
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : 'The local speech pack could not be installed.');
    } finally { if (mounted.current) setWakePackInstalling(false); }
  }, [wakePackInstalling]);

  useEffect(() => {
    const pause = () => {
      if (document.hidden && wakeController.current) {
        disarmWake();
        setNotice('Local wake listening paused because Nanivio is no longer visible. Enable it again when ready.');
      }
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, [disarmWake]);

  useEffect(() => {
    if (phase !== 'connecting' && phase !== 'connected') return;
    const timer = setInterval(() => {
      if (!deadline.current) return;
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSecondsRemaining(seconds);
      if (!seconds) { setNotice('Live avatar disconnected after 60 seconds without input.'); close(); }
    }, 250);
    return () => clearInterval(timer);
  }, [phase, close]);
  useEffect(() => {
    const leave = () => { disarmWake(); generation.current++; void cleanup(); };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [cleanup, disarmWake]);
  const interrupt = () => {
    playback.current?.interrupt(); pendingAudio.current = null;
    try { sdk.current?.interrupt(); } catch {}
    const id = sessionId.current;
    if (id) realtimeClient.send('malvi:brain_interrupt', { sessionId: id });
    if (id) void assistantRequest(`/session/${id}/activity`, { kind: 'interrupt' }).then(data => {
      if (id === sessionId.current) deadline.current = data.idleDeadline;
    }).catch(err => fail(err instanceof Error ? err.message : 'The session has ended.'));
  };
  return (
    <LiveContext.Provider value={{ readiness, notice, phase, wakeArmed, wakeChecking, wakePackRequired, wakePackInstalling, installWakePack, start, startVoiceTest, armWake, disarmWake, refresh }}>
      {children}
      {phase !== 'idle' && <MalviLiveOverlay
        videoRef={videoRef} onVideoElement={attachVideo} phase={phase} error={error} secondsRemaining={secondsRemaining}
        onClose={close} onInterrupt={interrupt} audioBlocked={audioBlocked} caption={caption}
        voiceOnly={voiceOnly}
        onPlayAudio={() => {
          if (voiceMode.current && playback.current) {
            const audio = pendingAudio.current;
            void (audio ? playback.current.play(audio) : playback.current.resume()).then(() => {
              pendingAudio.current = null; setAudioBlocked(false);
            }).catch(() => setAudioBlocked(true));
          } else void videoRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
        }}
        brainReady={brainReady}
        microphoneOn={microphoneOn}
        microphoneError={microphoneError}
        brainProvider={readiness?.brainProvider || null}
        references={references} referenceStatus={referenceStatus} unavailableSources={unavailableSources}
        onToggleMicrophone={() => void toggleMicrophone()}
      />}
    </LiveContext.Provider>
  );
};

export const MalviLiveControls: React.FC = () => {
  const { appLanguage, setAppLanguage } = useNanivio();
  const live = useContext(LiveContext);
  const [diagnostic, setDiagnostic] = useState('');
  const [checking, setChecking] = useState(false);
  if (!live) return null;
  const { readiness, phase, notice, wakeArmed, wakeChecking } = live;
  const ready = Boolean(readiness?.configured && readiness?.enabled);
  return (
    <section aria-label="Malvi LiveAvatar" className="mb-6 rounded-3xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--nv-gold)]">Nanivio · LiveAvatar LITE</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Meet Malvi, face to face</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">A live video connection with your Nanivio AI assistant. The server-selected brain provider handles conversation; turn on the microphone only when you are ready to speak.</p>
        </div>
        <span className="rounded-full border border-[var(--nv-border)] px-3 py-1.5 text-xs text-[var(--nv-gold)]">Video only after activation</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {readiness?.canRunSetupTests && <button type="button" disabled={!readiness.voiceTestAvailable || phase !== 'idle'} onClick={() => void live.startVoiceTest()} className="rounded-xl border border-[var(--nv-gold)] px-4 py-3 text-sm font-semibold text-[var(--nv-gold)] disabled:opacity-45">
          Test voice only · admin
        </button>}
        <button type="button" onClick={() => void live.start('manual')} disabled={!ready || phase !== 'idle'} style={{ backgroundColor: 'var(--nv-gold)', color: 'var(--nv-bg)' }} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
          <Video className="h-4 w-4" /> Start live avatar <ArrowUpRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => wakeArmed || wakeChecking ? live.disarmWake() : void live.armWake()} disabled={(!ready && !wakeArmed && !wakeChecking) || phase !== 'idle'} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-emerald-300 disabled:opacity-45">
          {wakeArmed ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {wakeChecking ? 'Cancel wake setup' : wakeArmed ? 'Stop local listening' : 'Enable local wake word'}
        </button>
        {live.wakePackRequired && <button type="button" onClick={() => void live.installWakePack()} disabled={live.wakePackInstalling} className="rounded-xl border border-slate-600 px-4 py-3 text-sm text-slate-100 disabled:opacity-45">
          {live.wakePackInstalling ? 'Installing local speech pack…' : 'Install local speech pack'}
        </button>}
      </div>
      {readiness?.canRunSetupTests && <div className="mt-4 text-xs leading-relaxed text-slate-300">
        <p>Voice-only testing uses the selected brain provider and may incur inference charges. No avatar is started. Microphone access requires a separate tap. The same session limits apply.</p>
        <button type="button" disabled={checking} className="mt-2 min-h-11 underline underline-offset-4 disabled:opacity-45" onClick={() => {
          setChecking(true); setDiagnostic('');
          void assistantRequest('/diagnostics', {}).then(data => {
            setDiagnostic(`Redis: ${data.redis}. Brain credentials: ${data.brain.configured ? 'configured, not live-tested' : 'missing'}. Avatar readiness: not verified. No provider session started.`);
          }).catch(error => setDiagnostic(error instanceof Error ? error.message : 'Setup check failed.')).finally(() => setChecking(false));
        }}>{checking ? 'Checking connection…' : 'Check Redis connection (no provider session)'}</button>
        {diagnostic && <p role="status">{diagnostic}</p>}
      </div>}
      <label className="mt-4 block text-sm text-slate-200">
        Malvi’s language · follows your app language
        <select aria-label="Malvi conversation language" value={appLanguage} onChange={event => setAppLanguage(event.target.value)} className="mt-2 block w-full max-w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-white">
          {MALVI_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.name} · {language.nativeName}</option>)}
        </select>
      </label>
      <p role="status" className="mt-2 text-xs leading-relaxed text-amber-200">
        {MALVI_LANGUAGES.some(language => language.code === appLanguage)
          ? malviLanguageCoverage(appLanguage, readiness?.brainProvider).notice
          : 'Choose a valid app language before starting Malvi.'}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Say “Malvi”, “Hey Malvi”, or “Nanivio” after enabling local listening. Wake recognition stays on-device and uses an English speech pack, independently of your conversation language. No cloud fallback or screen-locked listening. Sessions end after 60 seconds without input; maximum 10 starts per hour.</p>
      {wakeArmed && <p role="status" className="mt-3 text-sm text-[var(--nv-gold)]">Listening locally for “Malvi”, “Hey Malvi”, or “Nanivio”. No avatar connection is running.</p>}
      {readiness && !ready && <div role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-950/20 p-3 text-sm leading-relaxed text-amber-100">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        {!readiness.enabled ? 'Malvi must be enabled in administrator settings. ' : ''}
        {!readiness.configured ? `Live setup required: ${readiness.missing.join(', ')}. The supplied face must be provisioned as your custom LiveAvatar asset.` : ''}
        <button type="button" onClick={() => void live.refresh()} className="ml-2 underline underline-offset-4">Recheck setup</button>
      </div>}
      {notice && <p role="status" className="mt-3 text-sm text-amber-200">{notice}</p>}
    </section>
  );
};
