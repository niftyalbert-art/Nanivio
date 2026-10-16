import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Mic, MicOff, Video } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { assistantRequest, deliverMalviAudio, type LiveAvatarReadiness } from '../../lib/malviLiveClient';
import { startLocalMalviWakeWord } from '../../lib/localMalviWakeWord';
import { MalviLiveOverlay } from './MalviLiveOverlay';
import type { LiveAvatarSession } from '@heygen/liveavatar-web-sdk';

type Phase = 'idle' | 'connecting' | 'connected' | 'error';
interface LiveControls {
  readiness: LiveAvatarReadiness | null;
  notice: string;
  phase: Phase;
  wakeArmed: boolean;
  wakeChecking: boolean;
  start: (activation: 'manual' | 'wake-word') => Promise<void>;
  armWake: () => Promise<void>;
  disarmWake: () => void;
  refresh: () => Promise<void>;
}
const LiveContext = createContext<LiveControls | null>(null);

export const MalviLiveAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useNanivio();
  const [readiness, setReadiness] = useState<LiveAvatarReadiness | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [wakeArmed, setWakeArmed] = useState(false);
  const [wakeChecking, setWakeChecking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaReady = useRef(false);
  const sdk = useRef<LiveAvatarSession | null>(null);
  const sessionId = useRef<string | null>(null);
  const stopWake = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const deadline = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const disarmWake = useCallback(() => {
    stopWake.current?.(); stopWake.current = null; setWakeArmed(false);
  }, []);

  const cleanup = useCallback(async () => {
    const live = sdk.current, id = sessionId.current;
    sdk.current = null; sessionId.current = null; deadline.current = 0; mediaReady.current = false;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    await Promise.allSettled([
      live ? live.stop() : Promise.resolve(),
      id ? assistantRequest(`/session/${id}/end`, {}, true) : Promise.resolve(),
    ]);
  }, []);

  const close = useCallback(() => {
    generation.current++; busy.current = false; disarmWake();
    void cleanup();
    setPhase('idle'); setError(null); setAudioBlocked(false);
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
  useEffect(() => { void refresh(); }, [refresh, currentUser?.id]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++; busy.current = false;
      stopWake.current?.(); stopWake.current = null; void cleanup();
    };
  }, [cleanup, currentUser?.id]);

  const start = useCallback(async (activation: 'manual' | 'wake-word') => {
    if (busy.current || sdk.current) return;
    busy.current = true;
    const run = ++generation.current;
    disarmWake(); setError(null); setCaption('Connecting your live avatar. Conversation will be connected in the brain upgrade.');
    setSecondsRemaining(60); setAudioBlocked(false); setPhase('connecting');
    try {
      // No token exchange, SDK download, WebRTC, or provider audio before activation.
      const info = await assistantRequest('/session', { activation });
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
          void assistantRequest(`/session/${info.id}/welcome`, {}).then(audio => {
            if (run !== generation.current) return;
            deliverMalviAudio(live, audio); setCaption(audio.text);
          }).catch(err => {
            if (run === generation.current) setCaption(err instanceof Error ? err.message : 'The backend welcome voice is unavailable.');
          });
        }
      };
      live.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (run !== generation.current) return;
        streamReady = true;
        setPhase('connected');
        setCaption('Live visual session. The conversational brain will be connected next.');
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

  const armWake = useCallback(async () => {
    if (wakeChecking || wakeArmed || busy.current || sdk.current) return;
    setWakeChecking(true); setNotice('');
    const run = generation.current;
    try {
      const stop = await startLocalMalviWakeWord(
        () => { stopWake.current = null; setWakeArmed(false); void start('wake-word'); },
        message => { setWakeArmed(false); setNotice(message); },
      );
      if (run !== generation.current || !mounted.current) { stop(); return; }
      stopWake.current = stop; setWakeArmed(true);
    } catch (err) { setNotice(err instanceof Error ? err.message : 'On-device wake-word listening is unavailable.'); }
    finally { setWakeChecking(false); }
  }, [start, wakeArmed, wakeChecking]);

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
    const leave = () => { stopWake.current?.(); stopWake.current = null; generation.current++; void cleanup(); };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [cleanup]);
  const interrupt = () => {
    try { sdk.current?.interrupt(); } catch {}
    const id = sessionId.current;
    if (id) void assistantRequest(`/session/${id}/activity`, { kind: 'interrupt' }).then(data => {
      if (id === sessionId.current) deadline.current = data.idleDeadline;
    }).catch(err => fail(err instanceof Error ? err.message : 'The session has ended.'));
  };
  return (
    <LiveContext.Provider value={{ readiness, notice, phase, wakeArmed, wakeChecking, start, armWake, disarmWake, refresh }}>
      {children}
      {phase !== 'idle' && <MalviLiveOverlay
        videoRef={videoRef} onVideoElement={attachVideo} phase={phase} error={error} secondsRemaining={secondsRemaining}
        onClose={close} onInterrupt={interrupt} audioBlocked={audioBlocked} caption={caption}
        onPlayAudio={() => { void videoRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true)); }}
      />}
    </LiveContext.Provider>
  );
};

export const MalviLiveControls: React.FC = () => {
  const live = useContext(LiveContext);
  if (!live) return null;
  const { readiness, phase, notice, wakeArmed, wakeChecking } = live;
  const ready = Boolean(readiness?.configured && readiness?.enabled);
  return (
    <section aria-label="Malvi LiveAvatar" className="mb-6 rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-950/70 to-slate-950 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">Nanivio · LiveAvatar LITE</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Meet Malvi, face to face</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">A real video connection with your Nanivio AI assistant. The portrait below is a preview, not a live stream. The conversational brain is the next upgrade.</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 px-3 py-1.5 text-xs text-emerald-200">Video only after activation</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void live.start('manual')} disabled={!ready || phase !== 'idle'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-45">
          <Video className="h-4 w-4" /> Start live avatar <ArrowUpRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => wakeArmed ? live.disarmWake() : void live.armWake()} disabled={!ready || wakeChecking || phase !== 'idle'} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-emerald-300 disabled:opacity-45">
          {wakeArmed ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {wakeChecking ? 'Checking on-device recognition…' : wakeArmed ? 'Stop local listening' : 'Enable local “Nanivio” wake word'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Wake-word listening is opt-in and on-device only, in supported browsers with an installed English speech pack. No cloud fallback. Sessions end after 60 seconds without input; maximum 10 starts per hour.</p>
      {wakeArmed && <p role="status" className="mt-3 text-sm text-emerald-200">Listening locally for “Nanivio”. No avatar connection is running.</p>}
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
