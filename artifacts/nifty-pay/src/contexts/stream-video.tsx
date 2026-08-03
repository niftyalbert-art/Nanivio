/**
 * StreamVideoProvider — keeps one StreamVideoClient alive for the entire
 * authenticated session (not just while on /chat). This ensures:
 *  - incoming call.ring events are received from ANY page
 *  - the active-call overlay persists across page navigation
 *  - the video client does not reconnect every time the user opens /chat
 */
import {
  createContext, useContext, useEffect, useState, useRef,
  useCallback, type ReactNode,
} from 'react';
import { StreamVideoClient } from '@stream-io/video-react-sdk';
import { useStreamChat } from './stream-chat';
import { createRingtone } from '@/lib/sounds';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const API  = `${BASE}/api`;

export interface StreamVideoCtx {
  videoClient:   StreamVideoClient | null;
  incomingCall:  any;
  activeCall:    any;
  /** 'audio' or 'video' — kind of the active call */
  callKind:      'audio' | 'video';
  /** Initiate a call from a chat channel */
  startCall:   (type: 'audio' | 'video', callId: string, memberIds: string[]) => Promise<void>;
  acceptCall:  () => Promise<void>;
  declineCall: () => void;
  endCall:     () => void;
}

const Ctx = createContext<StreamVideoCtx>({
  videoClient: null, incomingCall: null, activeCall: null, callKind: 'video',
  startCall:   async () => {},
  acceptCall:  async () => {},
  declineCall: () => {},
  endCall:     () => {},
});

export function StreamVideoProvider({ children }: { children: ReactNode }) {
  const { streamData } = useStreamChat();
  const [videoClient,  setVideoClient]  = useState<StreamVideoClient | null>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [activeCall,   setActiveCall]   = useState<any>(null);
  const [callKind,     setCallKind]     = useState<'audio' | 'video'>('video');
  const incomingKindRef = useRef<'audio' | 'video'>('video');
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  /* ── init video client — once per authenticated session ── */
  useEffect(() => {
    if (!streamData) return;
    let cancelled = false;
    const authToken = localStorage.getItem('nanivio_token');

    fetch(`${API}/stream/video-token`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(({ token }: { token: string }) => {
        if (cancelled || !token) return;
        const vc = new StreamVideoClient({
          apiKey: streamData.apiKey,
          user:   { id: streamData.userId, name: streamData.userName },
          token,
        });
        // Clean up overlays when a call ends/rejects remotely
        vc.on('call.ended', () => {
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = null;
          setIncomingCall(null);
          setActiveCall((prev: any) => { prev?.leave?.().catch(() => {}); return null; });
        });
        vc.on('call.rejected', (event: any) => {
          // 1:1: if the other side declines, stop the outgoing call
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = null;
          setActiveCall((prev: any) => {
            if (prev && event.call?.id === prev.id) { prev.leave?.().catch(() => {}); return null; }
            return prev;
          });
        });
        vc.on('call.accepted', (event: any) => {
          // Callee answered — stop the caller's outgoing ringtone. Also clears
          // the incoming banner if this user accepted on another device.
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = null;
          setIncomingCall((prev: any) =>
            prev && event.call?.id === prev.id ? null : prev);
        });
        vc.on('call.ring', (event: any) => {
          // The server also delivers the ring event to the caller — ignore our own.
          if (event.call?.created_by?.id === streamData.userId) return;
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = createRingtone('incoming');
          // Create a proper Call SDK instance (not just raw event data) so
          // .join() / .leave() are available when the user accepts / declines.
          const callInstance = vc.call(event.call.type, event.call.id);
          incomingKindRef.current = (event.call?.custom?.kind === 'audio') ? 'audio' : 'video';
          setIncomingCall(callInstance);
        });
        setVideoClient(vc);
      })
      .catch(err => console.error('Video client init failed:', err));

    return () => {
      cancelled = true;
      setVideoClient(prev => {
        prev?.disconnectUser().catch(() => {});
        return null;
      });
      stopRingtoneRef.current?.();
    };
  }, [streamData?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── WebRTC support check ── */
  const assertWebRtcSupport = () => {
    if (typeof (window as any).RTCPeerConnection !== 'function') {
      throw new Error(
        "This browser can't make calls. Please open Nanivio in Safari or Chrome directly (not inside another app), and make sure WebRTC isn't disabled by a privacy setting or extension.",
      );
    }
  };

  /* ── accept incoming call ── */
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    assertWebRtcSupport();
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    try {
      // Disable devices before join so the SDK never fails the whole call
      // trying to auto-acquire media on devices without a camera/mic.
      try { await incomingCall.camera.disable(); } catch {}
      try { await incomingCall.microphone.disable(); } catch {}
      await incomingCall.join();
      // Publish media tracks — without this the other side sees no video/audio.
      const kind = incomingKindRef.current;
      try { await incomingCall.microphone.enable(); } catch {}
      if (kind === 'video') {
        // Cap publish resolution — smoother calls on average mobile networks
        try { incomingCall.camera.selectTargetResolution({ width: 640, height: 480 }); } catch {}
        try { await incomingCall.camera.enable(); } catch {}
      } else {
        try { await incomingCall.camera.disable(); } catch {}
      }
      setCallKind(kind);
      setActiveCall(incomingCall);
      setIncomingCall(null);
    } catch (e: any) {
      // Leave/decline so the caller isn't left ringing a dead call
      incomingCall?.leave?.({ reject: true }).catch(() => {});
      setIncomingCall(null);
      throw e; // caller (CallOverlay) shows the toast
    }
  }, [incomingCall]);

  /* ── decline incoming call ── */
  const declineCall = useCallback(() => {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    incomingCall?.leave?.().catch(() => {});
    setIncomingCall(null);
  }, [incomingCall]);

  /* ── end active call ── */
  const endCall = useCallback(() => {
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    activeCall?.leave?.().catch(() => {});
    setActiveCall(null);
  }, [activeCall]);

  /* ── start outgoing call ── */
  const startCall = useCallback(async (
    type: 'audio' | 'video',
    callId: string,
    memberIds: string[],
  ) => {
    if (!videoClient) throw new Error('Video not ready — please try again');
    assertWebRtcSupport();
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = createRingtone('outgoing');
    // Always use 'default' — 'audio_room' is broadcast-style and fails for 1-1 calls.
    // Audio-only vs video is controlled at the media track level, not the call type.
    const callType = 'default';
    const call = videoClient.call(callType, callId);
    try {
      await call.getOrCreate({
        ring: true,
        data: {
          members: memberIds.map(id => ({ user_id: id })),
          custom:  { kind: type },
        },
      });
      try { await call.camera.disable(); } catch {}
      try { await call.microphone.disable(); } catch {}
      await call.join({ create: false });
      // Publish media tracks — without this the receiver sees no video/audio.
      try { await call.microphone.enable(); } catch {}
      if (type === 'video') {
        // Cap publish resolution — smoother calls on average mobile networks
        try { call.camera.selectTargetResolution({ width: 640, height: 480 }); } catch {}
        try { await call.camera.enable(); } catch {}
      } else {
        try { await call.camera.disable(); } catch {}
      }
      // Keep the outgoing ringtone playing until the callee accepts
      // (stopped by the call.accepted / call.rejected / call.ended handlers).
      setCallKind(type);
      setActiveCall(call);
    } catch (e) {
      stopRingtoneRef.current?.();
      stopRingtoneRef.current = null;
      throw e;
    }
  }, [videoClient]);

  return (
    <Ctx.Provider value={{ videoClient, incomingCall, activeCall, callKind, startCall, acceptCall, declineCall, endCall }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStreamVideo() {
  return useContext(Ctx);
}
