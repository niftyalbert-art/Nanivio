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
  /** Initiate a call from a chat channel */
  startCall:   (type: 'audio' | 'video', callId: string, memberIds: string[]) => Promise<void>;
  acceptCall:  () => Promise<void>;
  declineCall: () => void;
  endCall:     () => void;
}

const Ctx = createContext<StreamVideoCtx>({
  videoClient: null, incomingCall: null, activeCall: null,
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
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  /* ── init video client — once per authenticated session ── */
  useEffect(() => {
    if (!streamData) return;
    let cancelled = false;
    const authToken = localStorage.getItem('nivio_token');

    fetch(`${API}/stream/video-token`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(({ token }: { token: string }) => {
        if (cancelled || !token) return;
        const vc = new StreamVideoClient({
          apiKey: streamData.apiKey,
          user:   { id: streamData.userId, name: streamData.userName },
          token,
        });
        vc.on('call.ring', (event: any) => {
          stopRingtoneRef.current?.();
          stopRingtoneRef.current = createRingtone('incoming');
          setIncomingCall(event.call);
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

  /* ── accept incoming call ── */
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = null;
    try {
      await incomingCall.join();
      setActiveCall(incomingCall);
      setIncomingCall(null);
    } catch (e: any) {
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
    stopRingtoneRef.current?.();
    stopRingtoneRef.current = createRingtone('outgoing');
    const callType = type === 'audio' ? 'audio_room' : 'default';
    const call = videoClient.call(callType, callId);
    try {
      await call.getOrCreate({
        ring: true,
        data: { members: memberIds.map(id => ({ user_id: id })) },
      });
      await call.join({ create: false });
      stopRingtoneRef.current?.();
      stopRingtoneRef.current = null;
      setActiveCall(call);
    } catch (e) {
      stopRingtoneRef.current?.();
      stopRingtoneRef.current = null;
      throw e;
    }
  }, [videoClient]);

  return (
    <Ctx.Provider value={{ videoClient, incomingCall, activeCall, startCall, acceptCall, declineCall, endCall }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStreamVideo() {
  return useContext(Ctx);
}
