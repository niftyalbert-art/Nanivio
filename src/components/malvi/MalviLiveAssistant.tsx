import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Video } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { assistantRequest, deliverMalviAudio, parseMalviReferenceCitations, type MalviReferenceCitation, type LiveAvatarReadiness } from '../../lib/malviLiveClient';
import { startLocalMalviWakeWord, installLocalMalviWakeWordPack, LocalWakeWordError } from '../../lib/localMalviWakeWord';
import { getMalviLanguage, MALVI_LANGUAGES, malviLanguageCoverage } from '../../lib/malviLanguages';
import { realtimeClient } from '../../lib/realtimeClient';
import { MalviLiveOverlay } from './MalviLiveOverlay';
import type { LiveAvatarSession } from '@heygen/liveavatar-web-sdk';
import { MalviVoicePlayback } from '../../lib/malviVoicePlayback';
import { malviAvatarSoundBlocked, playMalviAvatar } from '../../lib/malviAvatarPlayback';
import { MalviCaptionPlayer, estimatedMalviCaptionTrack, type MalviCaptionTrack } from '../../lib/malviSpeechTiming';
import { MalviAvatarPlayout } from '../../lib/malviAvatarPlayout';
import MalviWakeControls from './MalviWakeControls';
import { NanivioMicEngine } from '../../lib/nanivioMic/NanivioMicEngine';
import { BrowserMicCapture, browserMicStreamId } from '../../lib/nanivioMic/BrowserMicCapture';
import { NANIVIO_MIC_EVENTS } from '../../shared/nanivioMicProtocol';

type Phase = 'idle' | 'connecting' | 'connected' | 'error';
interface LiveControls {
  voiceProvider: 'elevenlabs' | 'gemini';
  selectVoice: (provider: 'elevenlabs' | 'gemini') => void;
  readiness: LiveAvatarReadiness | null;
  notice: string;
  phase: Phase;
  wakeArmed: boolean;
  wakeChecking: boolean;
  wakeFeedback: string;
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
  const [rawReadiness, setReadiness] = useState<LiveAvatarReadiness | null>(null);
  const [voiceChoice, setVoiceChoice] = useState<'elevenlabs' | 'gemini' | null>(null);
  const voiceProvider = voiceChoice || rawReadiness?.speech?.provider || 'elevenlabs';
  const voiceRef = useRef(voiceProvider);
  voiceRef.current = voiceProvider;
  const selectedSpeech = rawReadiness?.voiceOptions?.find(option => option.provider === voiceProvider);
  const readiness = rawReadiness && selectedSpeech ? {
    ...rawReadiness, speech: selectedSpeech,
    configured: Boolean(rawReadiness.infrastructureConfigured && selectedSpeech.configured),
    missing: [...rawReadiness.infrastructureMissing || [], ...selectedSpeech.missing || []],
  } : rawReadiness;
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [brainReady, setBrainReady] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [micReceiving, setMicReceiving] = useState(false);
  const userText = useRef('');
  const captions = useRef<MalviCaptionPlayer | null>(null);
  if (!captions.current) captions.current = new MalviCaptionPlayer((text, playing) => {
    setCaption(text); setSpeaking(playing);
    if (playing) setProcessing(false);
  });
  const [referenceStatus, setReferenceStatus] = useState('idle');
  const [references, setReferences] = useState<MalviReferenceCitation[]>([]);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [wakeArmed, setWakeArmed] = useState(false);
  const [wakeChecking, setWakeChecking] = useState(false);
  const [wakeFeedback, setWakeFeedback] = useState('');
  const [wakePackRequired, setWakePackRequired] = useState(false);
  const [wakePackInstalling, setWakePackInstalling] = useState(false);
  const wakeReadiness = useRef(readiness);
  wakeReadiness.current = readiness;
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [voiceOnly, setVoiceOnly] = useState(false);
  const voiceMode = useRef(false);
  const playback = useRef<MalviVoicePlayback | null>(null);
  const pendingAudio = useRef<{ audio: string; track: MalviCaptionTrack } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarPlayout = useRef<MalviAvatarPlayout | null>(null);
  const removeVideoListeners = useRef<(() => void) | null>(null);
  const mediaReady = useRef(false);
  const avatarAcceptingAudio = useRef(false);
  const startupAudio = useRef<any[]>([]);
  const receiveBrainAudio = useRef<((payload: any) => void) | null>(null);
  const sdk = useRef<LiveAvatarSession | null>(null);
  const sessionId = useRef<string | null>(null);
  const micEngine = useRef<NanivioMicEngine | null>(null);
  const stopWake = useRef<(() => void) | null>(null);
  const wakeController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const deadline = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const stopMicrophone = useCallback(() => {
    const engine = micEngine.current; micEngine.current = null;
    engine?.stop();
    setMicrophoneOn(false);
    setInputLevel(0); setMicReceiving(false);
  }, []);
  const disarmWake = useCallback(() => {
    wakeController.current?.abort(); wakeController.current = null;
    stopWake.current?.(); stopWake.current = null; setWakeArmed(false);
    setWakeChecking(false); setWakeFeedback('Local wake listening is off.'); setNotice('');
  }, []);

  const cleanup = useCallback(async () => {
    const live = sdk.current, id = sessionId.current;
    stopMicrophone();
    captions.current?.cancel();
    avatarPlayout.current?.close(); avatarPlayout.current = null;
    setProcessing(false); setUserTranscript(''); userText.current = '';
    playback.current?.close(); playback.current = null; pendingAudio.current = null;
    avatarAcceptingAudio.current = false; startupAudio.current = [];
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
    removeVideoListeners.current?.();
    removeVideoListeners.current = null;
    const previous = videoRef.current;
    if (previous && previous !== video) { previous.pause(); previous.srcObject = null; }
    videoRef.current = video;
    if (!video) return;
    const checkSound = () => {
      if (videoRef.current === video && sdk.current && mediaReady.current) {
        const blocked = malviAvatarSoundBlocked(video);
        setAudioBlocked(blocked);
        if (!blocked) {
          try { avatarPlayout.current?.attach(video); }
          catch (error) { setMicrophoneError(error instanceof Error ? error.message : 'Live subtitle playback monitoring is unavailable.'); }
        }
      }
    };
    const events = ['volumechange', 'playing', 'pause'] as const;
    events.forEach(event => video.addEventListener(event, checkSound));
    removeVideoListeners.current = () => events.forEach(event => video.removeEventListener(event, checkSound));
    if (!sdk.current || !mediaReady.current) return;
    try {
      sdk.current.attach(video);
      void playMalviAvatar(video).then(checkSound).catch(() => {
        if (videoRef.current === video && sdk.current && mediaReady.current) setAudioBlocked(true);
      });
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
        setCaption('');
      }
    });
    const handleAudio = (payload: any) => {
      if (!isCurrent(payload) || (payload.language && payload.language !== languageRef.current)) return;
      if (!voiceMode.current && !avatarAcceptingAudio.current) {
        if (startupAudio.current.length >= 2) { fail('Malvi’s avatar did not become ready before the voice startup queue filled.'); return; }
        startupAudio.current.push(payload);
        return;
      }
      try {
        if (!voiceMode.current && !sdk.current) return;
        const track = captions.current!.enqueue(payload.speechProvider === 'gemini' && payload.captionTiming === 'estimated'
          ? estimatedMalviCaptionTrack(payload.text, payload.durationMs, payload.speechDurationMs)
          : { alignment: payload.alignment, durationMs: payload.durationMs });
        setProcessing(true);
        if (voiceMode.current && playback.current) {
          deliverMalviAudio({ repeatAudio: audio => {
            void playback.current?.play(audio, {
              onStart: clock => captions.current?.start(clock, track),
              onEnd: () => captions.current?.finish(track),
            }).catch(() => {
              if (isCurrent(payload)) { pendingAudio.current = { audio, track }; setAudioBlocked(true); }
            });
          } }, payload);
        } else if (sdk.current) {
          avatarPlayout.current?.enqueue(track, payload.pcm24k);
          deliverMalviAudio(sdk.current, payload);
        }
        else return;
      } catch {
        captions.current?.cancel(); avatarPlayout.current?.cancel(); setProcessing(false);
        setMicrophoneError('Malvi’s voice audio could not be played.');
      }
    };
    receiveBrainAudio.current = handleAudio;
    const offAudio = realtimeClient.on('malvi:brain_audio', handleAudio);
    const offCaption = realtimeClient.on('malvi:brain_caption', (payload) => {
      if (!isCurrent(payload) || (payload.language && payload.language !== languageRef.current) || typeof payload.text !== 'string') return;
      if (payload.role === 'user') {
        userText.current = (userText.current + payload.text).slice(-300);
        setUserTranscript(userText.current);
      } else if (payload.role === 'assistant') {
        // Brain tokens arrive before TTS; only playback may expose their text.
        setProcessing(true);
      }
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
      if (isCurrent(payload)) {
        startupAudio.current = [];
        captions.current?.cancel(); avatarPlayout.current?.cancel(); setProcessing(false);
        playback.current?.interrupt(); pendingAudio.current = null; sdk.current?.interrupt();
      }
    });
    const offLanguage = realtimeClient.on('malvi:brain_language', payload => {
      if (!isCurrent(payload) || typeof payload.language !== 'string') return;
      setActiveLanguage(payload.language);
      setBrainReady(true);
      setCaption(''); setUserTranscript(''); userText.current = '';
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
      captions.current?.cancel(); avatarPlayout.current?.cancel(); setProcessing(false);
      sdk.current?.interrupt();
      playback.current?.interrupt(); pendingAudio.current = null;
      startupAudio.current = [];
      setBrainReady(false);
      setCaption('');
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
    if (micEngine.current) { stopMicrophone(); return; }
    const id = sessionId.current;
    if (!id || !brainReady) return;
    setMicrophoneError('');
    let streamId: string;
    try { streamId = browserMicStreamId(); }
    catch (error) { setMicrophoneError(error instanceof Error ? error.message : 'Nanivio Mic could not start securely.'); return; }
    const engine = new NanivioMicEngine({
      sessionId: id, streamId, capture: new BrowserMicCapture(),
      transport: {
        send: (type, payload) => realtimeClient.send(type, payload) === true,
        subscribe: listener => realtimeClient.on(NANIVIO_MIC_EVENTS.status, listener),
      },
      onState: snapshot => {
        if (micEngine.current !== engine || sessionId.current !== id || !mounted.current) return;
        setMicrophoneOn(snapshot.captureActive);
        setMicReceiving(snapshot.serverReceiving);
        setInputLevel(snapshot.level);
        if (snapshot.error) { setMicrophoneError(snapshot.error); micEngine.current = null; }
      },
      onSpeechStart: () => { userText.current = ''; setUserTranscript(''); setProcessing(false); },
      onSpeechEnd: () => setProcessing(true),
    });
    micEngine.current = engine;
    await engine.start();
  }, [brainReady, stopMicrophone]);
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
      const observer = new MalviAvatarPlayout(
        (track, clock) => captions.current?.start(clock, track),
        track => captions.current?.finish(track),
        message => { captions.current?.cancel(); setMicrophoneError(message); },
      );
      avatarPlayout.current = observer;
      try { await observer.resume(); }
      catch (error) {
        setMicrophoneError(error instanceof Error ? error.message : 'Live subtitle playback monitoring is unavailable.');
      }
      if (run !== generation.current || !mounted.current) { observer.close(); return; }
      // No token exchange, SDK download, WebRTC, or provider audio before activation.
      const language = getMalviLanguage(languageRef.current);
      const info = await assistantRequest('/session', { activation, language: language.code, speechProvider: voiceRef.current });
      if (run !== generation.current || !mounted.current) {
        await assistantRequest(`/session/${info.id}/end`, {}, true).catch(() => {});
        return;
      }
      sessionId.current = info.id; deadline.current = info.idleDeadline;
      const { LiveAvatarSession, SessionEvent, SessionMode, AgentEventsEnum } = await import('@heygen/liveavatar-web-sdk');
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
      live.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        if (run === generation.current) avatarPlayout.current?.providerStart();
      });
      live.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        if (run === generation.current) avatarPlayout.current?.providerEnd();
      });
      let streamReady = false, sessionStarted = false;
      const releaseReadyAudio = () => {
        if (streamReady && sessionStarted && run === generation.current) {
          avatarAcceptingAudio.current = true;
          const queued = startupAudio.current.splice(0);
          for (const audio of queued) receiveBrainAudio.current?.(audio);
        }
      };
      live.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (run !== generation.current) return;
        streamReady = true;
        setPhase('connected');
        setCaption('');
        mediaReady.current = true;
        attachVideo(videoRef.current);
        releaseReadyAudio();
      });
      live.on(SessionEvent.SESSION_DISCONNECTED, () => {
        if (run === generation.current) {
          setNotice('The live avatar session ended. No automatic reconnection was started.');
          close();
        }
      });
      // Connect the one selected brain while the renderer starts. Never open
      // the microphone here; at most two early speech packets wait for media.
      realtimeClient.send('malvi:brain_start', { sessionId: info.id, language: languageRef.current });
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
      releaseReadyAudio();
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
      const info = await assistantRequest('/voice-session', { activation: 'manual', language: language.code, speechProvider: voiceRef.current });
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
    if (phase === 'error') { setPhase('idle'); setError(null); }
    setWakeChecking(true); setNotice(''); setWakeFeedback('Checking browser support and starting local microphone listening…');
    const run = generation.current;
    try {
      const stop = await startLocalMalviWakeWord(
        () => {
          if (controller.signal.aborted || !mounted.current) return;
          wakeController.current = null; stopWake.current = null; setWakeArmed(false); setWakeChecking(false);
          if (!wakeReadiness.current?.enabled || !wakeReadiness.current?.configured) {
            setWakeFeedback('“Malvi” was detected locally, but the live assistant is not ready. Complete the setup shown below, then enable local listening again. No provider session was started.');
            return;
          }
          void start('wake-word');
        },
        message => {
          if (controller.signal.aborted || !mounted.current) return;
          wakeController.current = null; stopWake.current = null; setWakeArmed(false); setWakeChecking(false); setWakeFeedback(message);
        },
        controller.signal,
        state => {
          if (controller.signal.aborted || !mounted.current) return;
          setWakeArmed(state === 'listening');
          setWakeChecking(state === 'restarting');
          setWakeFeedback(state === 'listening'
            ? 'Enabled — Listening locally for “Malvi”, “Hey Malvi”, or “Nanivio”. Tap Enabled again to turn it off. No avatar connection is running.'
            : 'Restarting local microphone listening… You can cancel wake setup.');
        },
      );
      if (controller.signal.aborted || run !== generation.current || !mounted.current) { stop(); return; }
      setWakePackRequired(false);
      stopWake.current = stop; setWakeArmed(true);
    } catch (err) {
      if (!controller.signal.aborted && mounted.current) {
        wakeController.current = null;
        setWakePackRequired(err instanceof LocalWakeWordError && err.code === 'PACK_REQUIRED');
        setWakeFeedback(err instanceof Error ? err.message : 'On-device wake-word listening is unavailable.');
      }
    } finally { if (mounted.current && !controller.signal.aborted) setWakeChecking(false); }
  }, [start, wakeArmed, wakeChecking, phase]);

  const installWakePack = useCallback(async () => {
    if (wakePackInstalling) return;
    setWakePackInstalling(true);
    setWakeFeedback('Installing the English on-device speech pack. Your browser may request confirmation.');
    try {
      const installed = await installLocalMalviWakeWordPack();
      if (!mounted.current) return;
      setWakePackRequired(!installed);
      setWakeFeedback(installed ? 'Local speech pack installed. Tap Enable local wake word to begin listening.' : 'The speech pack could not be installed. You can still start Malvi manually.');
    } catch (error) {
      if (mounted.current) setWakeFeedback(error instanceof Error ? error.message : 'The local speech pack could not be installed.');
    } finally { if (mounted.current) setWakePackInstalling(false); }
  }, [wakePackInstalling]);

  useEffect(() => {
    const pause = () => {
      if (document.hidden && wakeController.current) {
        disarmWake();
        setWakeFeedback('Local wake listening paused because Nanivio is no longer visible. Enable it again when ready.');
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
    captions.current?.cancel(); avatarPlayout.current?.cancel(); setProcessing(false);
    playback.current?.interrupt(); pendingAudio.current = null;
    try { sdk.current?.interrupt(); } catch {}
    const id = sessionId.current;
    if (id) realtimeClient.send('malvi:brain_interrupt', { sessionId: id });
    if (id) void assistantRequest(`/session/${id}/activity`, { kind: 'interrupt' }).then(data => {
      if (id === sessionId.current) deadline.current = data.idleDeadline;
    }).catch(err => fail(err instanceof Error ? err.message : 'The session has ended.'));
  };
  return (
    <LiveContext.Provider value={{ readiness, voiceProvider, selectVoice: provider => {
      if (phase !== 'idle') return;
      disarmWake(); setVoiceChoice(provider);
    }, notice, phase, wakeArmed, wakeChecking, wakeFeedback, wakePackRequired, wakePackInstalling, installWakePack, start, startVoiceTest, armWake, disarmWake, refresh }}>
      {children}
      {phase !== 'idle' && <MalviLiveOverlay
        videoRef={videoRef} onVideoElement={attachVideo} phase={phase} error={error} secondsRemaining={secondsRemaining}
        onClose={close} onInterrupt={interrupt} audioBlocked={audioBlocked} caption={caption}
        approximateCaptions={voiceProvider === 'gemini'}
        voiceOnly={voiceOnly}
        onPlayAudio={() => {
          if (voiceMode.current && playback.current) {
            const pending = pendingAudio.current;
            void (pending ? playback.current.play(pending.audio, {
              onStart: clock => captions.current?.start(clock, pending.track),
              onEnd: () => captions.current?.finish(pending.track),
            }) : playback.current.resume()).then(() => {
              pendingAudio.current = null; setAudioBlocked(false);
            }).catch(() => setAudioBlocked(true));
          } else {
            const video = videoRef.current;
            if (!video) return;
            void avatarPlayout.current?.resume().catch(error => {
              setMicrophoneError(error instanceof Error ? error.message : 'Live subtitle playback monitoring is unavailable.');
            });
            void playMalviAvatar(video, true).then(() => {
              if (videoRef.current === video && sdk.current) {
                setAudioBlocked(false);
                try { avatarPlayout.current?.attach(video); }
                catch (error) { setMicrophoneError(error instanceof Error ? error.message : 'Live subtitle playback monitoring is unavailable.'); }
              }
            }).catch(() => {
              if (videoRef.current === video && sdk.current) setAudioBlocked(true);
            });
          }
        }}
        brainReady={brainReady}
        microphoneOn={microphoneOn}
        inputLevel={inputLevel}
        inputState={!microphoneOn ? 'off' : !micReceiving ? 'connecting' : inputLevel > 0.075 ? 'hearing' : processing ? 'processing' : 'listening'}
        speaking={speaking}
        userTranscript={userTranscript}
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
  const languageSupported = !readiness?.speech || readiness.speech.supportedLanguages.includes(appLanguage || 'en');
  const ready = Boolean(readiness?.configured && readiness?.enabled && languageSupported);
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
      {readiness?.voiceOptions && <div className="mt-4 max-w-lg">
        <label htmlFor="malvi-voice-provider" className="block text-sm font-semibold text-slate-200">Malvi’s voice</label>
        <select id="malvi-voice-provider" value={live.voiceProvider} disabled={phase !== 'idle'}
          onChange={event => live.selectVoice(event.target.value as 'elevenlabs' | 'gemini')}
          className="mt-2 w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 py-3 text-sm text-white disabled:opacity-50">
          <option value="elevenlabs">ElevenLabs · approved Malvi voice</option>
          <option value="gemini">Gemini · Sulafat · approved Malvi style</option>
        </select>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{live.voiceProvider === 'gemini'
          ? 'Uses Sulafat with Malvi’s approved warm, fuller voice direction and gentle ambience/echo. English uses a light British–Ghanaian blend; other languages keep their own pronunciation. This is not a clone of her ElevenLabs voice, and generated delivery may vary. Gemini usage limits and charges apply; no ElevenLabs credits are used. Captions have approximate timing. Audio waits for each response to finish generating.'
          : 'Uses the approved Malvi voice and ElevenLabs credits, with provider-timed captions. No automatic switch to another voice.'}</p>
      </div>}
      <div className="mt-5 flex flex-wrap gap-3">
        {readiness?.canRunSetupTests && <button type="button" disabled={!readiness.voiceTestAvailable || readiness.speech?.configured === false || !languageSupported || phase !== 'idle'} onClick={() => void live.startVoiceTest()} className="rounded-xl border border-[var(--nv-gold)] px-4 py-3 text-sm font-semibold text-[var(--nv-gold)] disabled:opacity-45">
          Test voice only · admin
        </button>}
        <button type="button" onClick={() => void live.start('manual')} disabled={!ready || phase !== 'idle'} style={{ backgroundColor: 'var(--nv-gold)', color: 'var(--nv-bg)' }} className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
          <Video className="h-4 w-4" /> Start live avatar <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      <MalviWakeControls
        armed={wakeArmed} checking={wakeChecking} installing={live.wakePackInstalling}
        packRequired={live.wakePackRequired} feedback={live.wakeFeedback}
        disabled={phase === 'connecting' || phase === 'connected' || live.wakePackInstalling}
        onToggle={() => wakeArmed || wakeChecking ? live.disarmWake() : void live.armWake()}
        onInstall={() => void live.installWakePack()}
      />
      {readiness?.canRunSetupTests && <div className="mt-4 text-xs leading-relaxed text-slate-300">
        <p>Voice-only testing uses your selected brain and voice and may incur provider charges. No avatar is started. Microphone access requires a separate tap. The same session limits apply.</p>
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
      <p id="malvi-wake-help" className="mt-3 text-xs leading-relaxed text-slate-400">Local wake setup checks your browser independently of avatar setup. Most mobile browsers do not support on-device wake recognition; use manual activation there. Say “Malvi”, “Hey Malvi”, or “Nanivio” after enabling local listening. Recognition stays on-device and uses an English speech pack, independently of your conversation language. A detected wake word only starts a session when Malvi’s live setup is ready. No cloud fallback or screen-locked listening. Sessions end after 60 seconds without input; maximum 10 starts per hour.</p>
      {readiness && !ready && <div role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-950/20 p-3 text-sm leading-relaxed text-amber-100">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        {!readiness.enabled ? 'Malvi must be enabled in administrator settings. ' : ''}
        {!readiness.configured ? `Live setup required: ${readiness.missing.join(', ')}. The supplied face must be provisioned as your custom LiveAvatar asset.` : ''}
        {!languageSupported ? 'Your selected language is not listed for Malvi’s selected voice. Choose a supported language; Malvi will not substitute English or another voice.' : ''}
        <button type="button" onClick={() => void live.refresh()} className="ml-2 underline underline-offset-4">Recheck setup</button>
      </div>}
      {notice && <p role="status" className="mt-3 text-sm text-amber-200">{notice}</p>}
    </section>
  );
};
