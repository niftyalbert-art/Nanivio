/**
 * AgoraCallProvider — audio/video calling engine on Agora RTC.
 *
 * Signaling rides on Stream Chat custom user events, relayed through the
 * api-server (`POST /agora/signal`) so the callee receives call_invite /
 * call_accept / call_reject / call_end / call_cancel on any page.
 *
 * Mounted once per authenticated session (like the old StreamVideoProvider)
 * so incoming calls are received from ANY page and the call overlay
 * persists across navigation.
 */
import {
  createContext, useContext, useEffect, useState, useRef,
  useCallback, type ReactNode,
} from 'react';
import AgoraRTC, {
  type IAgoraRTCClient, type IMicrophoneAudioTrack, type ICameraVideoTrack,
  type IRemoteVideoTrack, type IRemoteAudioTrack,
} from 'agora-rtc-sdk-ng';
import { useStreamChat } from './stream-chat';
import { createRingtone } from '@/lib/sounds';
import { toast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const API  = `${BASE}/api`;

AgoraRTC.setLogLevel(2); // warnings+errors only

export interface IncomingCall {
  channel:    string;
  chatId:     string;
  kind:       'audio' | 'video';
  fromUserId: string;
  fromName:   string;
}

export interface AgoraCallCtx {
  /** true once signaling is connected (chat client ready) */
  ready:        boolean;
  incomingCall: IncomingCall | null;
  /** non-null while a call is active (dialing or connected) */
  activeCall:   { channel: string; chatId: string; otherUserId: string; otherName: string } | null;
  callKind:     'audio' | 'video';
  /** remote side has joined the media channel */
  remoteJoined: boolean;
  remoteVideoTrack: IRemoteVideoTrack | null;
  localVideoTrack:  ICameraVideoTrack | null;
  micOn: boolean;
  camOn: boolean;
  toggleMic:    () => Promise<void>;
  toggleCamera: () => Promise<void>;
  startCall:   (type: 'audio' | 'video', chatId: string, otherUserId: string, otherName: string) => Promise<void>;
  acceptCall:  () => Promise<void>;
  declineCall: () => void;
  endCall:     () => void;
}

const Ctx = createContext<AgoraCallCtx>({
  ready: false, incomingCall: null, activeCall: null, callKind: 'video',
  remoteJoined: false, remoteVideoTrack: null, localVideoTrack: null,
  micOn: true, camOn: true,
  toggleMic: async () => {}, toggleCamera: async () => {},
  startCall: async () => {}, acceptCall: async () => {},
  declineCall: () => {}, endCall: () => {},
});

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nanivio_token')}` };
}

async function fetchRtcToken(channel: string, chatId: string): Promise<{ appId: string; token: string; uid: number }> {
  const r = await fetch(`${API}/agora/token?channel=${encodeURIComponent(channel)}&chatId=${encodeURIComponent(chatId)}`, { headers: authHeaders() });
  const d = await r.json();
  if (!r.ok || !d?.appId) throw new Error(d?.error ?? 'Could not get call access');
  return d;
}

function sendSignal(toUserId: string | number, event: { type: string; channel: string; chatId: string; kind?: 'audio' | 'video' }): Promise<void> {
  return fetch(`${API}/agora/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ toUserId: Number(toUserId), event }),
  }).then(async r => {
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.error ?? 'Call signaling failed');
    }
  });
}

export function AgoraCallProvider({ children }: { children: ReactNode }) {
  const { streamData, chatClient } = useStreamChat();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<{ channel: string; chatId: string; otherUserId: string; otherName: string } | null>(null);
  const [callKind, setCallKind] = useState<'audio' | 'video'>('video');
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camTrackRef = useRef<ICameraVideoTrack | null>(null);
  const remoteAudioRef = useRef<IRemoteAudioTrack | null>(null);
  const stopRingtoneRef = useRef<(() => void) | null>(null);
  const noAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs mirroring state for use inside event handlers
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;
  const incomingCallRef = useRef(incomingCall);
  incomingCallRef.current = incomingCall;

  const stopTone = () => { stopRingtoneRef.current?.(); stopRingtoneRef.current = null; };

  // Guards against races: only one join may be in flight, and any teardown
  // invalidates joins still awaiting (epoch bump → stale join aborts).
  const joiningRef = useRef(false);
  const epochRef = useRef(0);
  // Channel of an outgoing call still connecting — lets reject/cancel/end
  // signals abort a call before activeCall is set.
  const pendingChannelRef = useRef<string | null>(null);

  const assertWebRtcSupport = () => {
    if (typeof (window as any).RTCPeerConnection !== 'function') {
      throw new Error(
        "This browser can't make calls. Please open Nanivio in Safari or Chrome directly (not inside another app), and make sure WebRTC isn't disabled by a privacy setting or extension.",
      );
    }
  };

  /** Leave the media channel and release devices. */
  const teardownMedia = useCallback(async () => {
    epochRef.current += 1; // invalidate any join still in flight
    joiningRef.current = false; // never leave the join lock stuck
    pendingChannelRef.current = null;
    if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
    stopTone();
    try { micTrackRef.current?.close(); } catch {}
    try { camTrackRef.current?.close(); } catch {}
    micTrackRef.current = null;
    camTrackRef.current = null;
    try { remoteAudioRef.current?.stop(); } catch {}
    remoteAudioRef.current = null;
    setLocalVideoTrack(null);
    setRemoteVideoTrack(null);
    setRemoteJoined(false);
    const c = clientRef.current;
    clientRef.current = null;
    if (c) { try { await c.leave(); } catch {} c.removeAllListeners(); }
  }, []);

  /** Join an Agora channel and publish mic (+camera for video). */
  const joinAndPublish = useCallback(async (channel: string, chatId: string, kind: 'audio' | 'video') => {
    const epoch = epochRef.current;
    const assertFresh = () => {
      if (epochRef.current !== epoch) throw new Error('call-cancelled');
    };
    // Acquire devices in parallel with the token fetch + network join —
    // device acquisition is usually the slowest step, so overlapping them
    // cuts connect time roughly in half.
    const micP: Promise<IMicrophoneAudioTrack | null> = AgoraRTC.createMicrophoneAudioTrack()
      .catch((e) => { console.warn('[call] mic unavailable:', e); return null; });
    const camP: Promise<ICameraVideoTrack | null> = kind === 'video'
      ? AgoraRTC.createCameraVideoTrack({
          encoderConfig: { width: 640, height: 480, frameRate: 24 }, // smooth on mobile networks
        }).catch((e) => { console.warn('[call] camera unavailable:', e); return null; })
      : Promise.resolve(null);
    // If we bail out before the tracks are stored in refs, close them on arrival
    const closeUnclaimedTracks = () => {
      micP.then(t => { if (micTrackRef.current !== t) { try { t?.close(); } catch {} } });
      camP.then(t => { if (camTrackRef.current !== t) { try { t?.close(); } catch {} } });
    };

    try {
    const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out — please check your connection and try again`)), ms))]);

    const { appId, token, uid } = await withTimeout(fetchRtcToken(channel, chatId), 10_000, 'Call setup');
    assertFresh();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    client.on('user-published', async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') setRemoteVideoTrack(user.videoTrack ?? null);
        if (mediaType === 'audio') { remoteAudioRef.current = user.audioTrack ?? null; user.audioTrack?.play(); }
      } catch (e) { console.warn('[call] subscribe failed:', e); }
    });
    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') setRemoteVideoTrack(null);
    });
    client.on('user-joined', () => {
      // Other side is in the room — stop the outgoing tone
      stopTone();
      if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
      setRemoteJoined(true);
    });
    client.on('user-left', () => {
      // 1:1 call — when the other side leaves, the call is over
      setRemoteJoined(false);
      void endCallRef.current?.();
    });

    try {
      await withTimeout(client.join(appId, channel, token, uid), 15_000, 'Connecting');
    } catch (e: any) {
      // Agora projects in "Testing: App ID only" mode reject all tokens.
      // Fall back to a token-less join so calls work in either project mode.
      const msg = String(e?.message ?? e);
      if (e?.code === 'CAN_NOT_GET_GATEWAY_SERVER' || /invalid token|dynamic key/i.test(msg)) {
        console.warn('[call] token rejected — retrying token-less join (App ID-only project mode)');
        await client.join(appId, channel, null, uid);
      } else {
        throw e;
      }
    }
    assertFresh();

    // Publish whatever devices we got; missing mic/camera never fails the join
    const [mic, cam] = await Promise.all([micP, camP]);
    assertFresh();
    if (mic) micTrackRef.current = mic;
    if (cam) camTrackRef.current = cam;
    const tracks = [mic, cam].filter(Boolean) as any[];
    if (tracks.length) {
      try { await client.publish(tracks); } catch (e) { console.warn('[call] publish failed:', e); }
    }
    setMicOn(!!mic);
    setCamOn(kind === 'video' && !!cam);
    setLocalVideoTrack(kind === 'video' ? cam : null);
    } catch (e) {
      closeUnclaimedTracks();
      throw e;
    }
  }, []);

  /* ── end active call ── */
  const endCall = useCallback(() => {
    const ac = activeCallRef.current;
    if (ac) sendSignal(ac.otherUserId, { type: 'call_end', channel: ac.channel, chatId: ac.chatId }).catch(() => {});
    setActiveCall(null);
    void teardownMedia();
  }, [teardownMedia]);
  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  /* ── start outgoing call ── */
  const startCall = useCallback(async (
    type: 'audio' | 'video', chatId: string, otherUserId: string, otherName: string,
  ) => {
    assertWebRtcSupport();
    if (activeCallRef.current || joiningRef.current) throw new Error('You are already in a call');
    joiningRef.current = true;
    // Unique channel per call attempt so stale signals from an earlier call
    // in the same conversation can never affect this one.
    const channel = `nanivio-${chatId}-${Math.random().toString(36).slice(2, 10)}`;
    pendingChannelRef.current = channel;
    stopTone();
    stopRingtoneRef.current = createRingtone('outgoing');
    // Show the ringing overlay immediately — joining takes a couple of
    // seconds and silent buttons invite double-taps.
    setCallKind(type);
    setActiveCall({ channel, chatId, otherUserId, otherName });
    try {
      await joinAndPublish(channel, chatId, type);
      await sendSignal(otherUserId, { type: 'call_invite', channel, chatId, kind: type });
      // No-answer timeout — hang up after 60s if nobody joins
      noAnswerTimerRef.current = setTimeout(() => {
        if (!clientRef.current) return;
        sendSignal(otherUserId, { type: 'call_cancel', channel, chatId }).catch(() => {});
        setActiveCall(null);
        void teardownMedia();
      }, 60_000);
    } catch (e: any) {
      if (e?.message !== 'call-cancelled') {
        setActiveCall(null);
        await teardownMedia();
      }
      throw e;
    } finally {
      joiningRef.current = false;
      pendingChannelRef.current = null;
    }
  }, [joinAndPublish, teardownMedia]);

  /* ── accept incoming call ── */
  const acceptCall = useCallback(async () => {
    const inc = incomingCallRef.current;
    if (!inc || joiningRef.current || activeCallRef.current) return;
    assertWebRtcSupport();
    joiningRef.current = true;
    stopTone();
    // Optimistic accept: tell the caller and switch to the call UI right
    // away, then connect media in the background — accept feels instant.
    sendSignal(inc.fromUserId, { type: 'call_accept', channel: inc.channel, chatId: inc.chatId }).catch(() => {});
    setCallKind(inc.kind);
    setActiveCall({ channel: inc.channel, chatId: inc.chatId, otherUserId: inc.fromUserId, otherName: inc.fromName });
    setIncomingCall(null);
    try {
      await joinAndPublish(inc.channel, inc.chatId, inc.kind);
    } catch (e: any) {
      if (e?.message !== 'call-cancelled') {
        sendSignal(inc.fromUserId, { type: 'call_end', channel: inc.channel, chatId: inc.chatId }).catch(() => {});
        setActiveCall(null);
        await teardownMedia();
      }
      throw e; // CallOverlay shows the toast
    } finally {
      joiningRef.current = false;
    }
  }, [joinAndPublish, teardownMedia]);

  /* ── decline incoming call ── */
  const declineCall = useCallback(() => {
    const inc = incomingCallRef.current;
    stopTone();
    if (inc) sendSignal(inc.fromUserId, { type: 'call_reject', channel: inc.channel, chatId: inc.chatId }).catch(() => {});
    setIncomingCall(null);
  }, []);

  /* ── mic / camera toggles ── */
  const toggleMic = useCallback(async () => {
    const t = micTrackRef.current;
    if (!t) return;
    const next = !micOn;
    await t.setEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCamera = useCallback(async () => {
    const t = camTrackRef.current;
    if (!t) return;
    const next = !camOn;
    await t.setEnabled(next);
    setCamOn(next);
  }, [camOn]);

  /* ── signaling listeners on the Stream Chat websocket ── */
  useEffect(() => {
    if (!chatClient || !streamData) return;

    const handler = (event: any) => {
      switch (event.type) {
        case 'call_invite': {
          // Already busy → auto-reject so the caller isn't left hanging
          if (activeCallRef.current || incomingCallRef.current || joiningRef.current) {
            sendSignal(event.fromUserId, { type: 'call_reject', channel: event.callChannel, chatId: event.callChatId }).catch(() => {});
            return;
          }
          stopTone();
          stopRingtoneRef.current = createRingtone('incoming');
          setIncomingCall({
            channel: event.callChannel,
            chatId: event.callChatId,
            kind: event.kind === 'audio' ? 'audio' : 'video',
            fromUserId: event.fromUserId,
            fromName: event.fromName ?? 'Someone',
          });
          break;
        }
        case 'call_accept': {
          // Callee answered — stop the outgoing tone (media join stops it too)
          if (activeCallRef.current?.channel === event.callChannel) stopTone();
          // Accepted on another of MY devices → clear my local banner
          if (incomingCallRef.current?.channel === event.callChannel) { stopTone(); setIncomingCall(null); }
          break;
        }
        case 'call_reject': {
          if (activeCallRef.current?.channel === event.callChannel
              || pendingChannelRef.current === event.callChannel) {
            const name = activeCallRef.current?.otherName ?? event.fromName ?? 'User';
            setActiveCall(null);
            void teardownMedia();
            toast({ title: 'User busy', description: `${name} is busy right now. Try again later.` });
          }
          break;
        }
        case 'call_cancel': {
          if (incomingCallRef.current?.channel === event.callChannel) {
            stopTone();
            setIncomingCall(null);
          }
          break;
        }
        case 'call_end': {
          if (activeCallRef.current?.channel === event.callChannel
              || pendingChannelRef.current === event.callChannel) {
            setActiveCall(null);
            void teardownMedia();
          }
          if (incomingCallRef.current?.channel === event.callChannel) {
            stopTone();
            setIncomingCall(null);
          }
          break;
        }
      }
    };

    const subs = ['call_invite', 'call_accept', 'call_reject', 'call_cancel', 'call_end']
      .map(t => chatClient.on(t as any, handler));
    return () => {
      subs.forEach(s => s.unsubscribe());
      stopTone();
      void teardownMedia();
    };
  }, [chatClient, streamData?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{
      ready: !!chatClient, incomingCall, activeCall, callKind,
      remoteJoined, remoteVideoTrack, localVideoTrack, micOn, camOn,
      toggleMic, toggleCamera, startCall, acceptCall, declineCall, endCall,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAgoraCall() {
  return useContext(Ctx);
}
