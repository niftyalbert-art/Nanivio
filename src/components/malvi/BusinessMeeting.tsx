import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Camera, Headphones, LoaderCircle, Mic, MicOff, Radio, Video, VideoOff } from 'lucide-react';
import { malviBusinessClient } from '../../lib/malviBusinessClient';
import type { BusinessRoom } from '../../types/malviBusiness';

type RoomMutation = (label: string, action: (id: string) => Promise<{ room: BusinessRoom }>) => Promise<void>;
interface Props {
  room: BusinessRoom;
  currentUserId: string;
  currentUserLanguage: string;
  onCommand: RoomMutation;
  onRoomUpdated: (room: BusinessRoom) => void;
}
interface RemoteTrack {
  uid: string | number;
  videoTrack?: any;
  audioTrack?: any;
}
export const BusinessMeeting: React.FC<Props> = ({ room, currentUserId, currentUserLanguage, onCommand, onRoomUpdated }) => {
  const owner = room.ownerId === currentUserId;
  const [withCamera, setWithCamera] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [leaseRemaining, setLeaseRemaining] = useState<number | null>(null);
  const [transcriptSharing, setTranscriptSharing] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [visibleTranslations, setVisibleTranslations] = useState<Record<string, boolean>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const playback = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    setReading(false);
    return () => { playback.current?.pause(); playback.current = null; };
  }, [room.id, connected]);
  const activeRoomId = useRef(room.id);
  activeRoomId.current = room.id;
  const session = useRef<{ client: any; roomId: string; epoch: number; mic: any; camera: any; handlers: Array<[string, (...args: any[]) => void]> } | null>(null);
  const lease = useRef<{ roomId: string; leaseId: string; endsAt: number; confirmed: boolean; ended: boolean } | null>(null);
  const transcriptWorker = useRef<{ active: boolean; stream: MediaStream; recorder: any; timer: number | null; controller: AbortController | null; epoch: number } | null>(null);
  const epoch = useRef(0);
  const videoContainers = useRef(new Map<string, HTMLDivElement>());
  const localVideoContainer = useRef<HTMLDivElement | null>(null);

  const stopTranscriptCapture = () => {
    const worker = transcriptWorker.current;
    if (!worker) return;
    transcriptWorker.current = null;
    worker.active = false;
    if (worker.timer !== null) window.clearTimeout(worker.timer);
    worker.controller?.abort();
    try { if (worker.recorder?.state !== 'inactive') worker.recorder?.stop(); } catch { /* Recorder already stopped. */ }
    worker.stream.getTracks().forEach(track => track.stop());
    setTranscriptSharing(false);
  };

  const dispose = async () => {
    stopTranscriptCapture();
    const active = session.current;
    session.current = null;
    epoch.current += 1;
    setConnected(false);
    setConnecting(false);
    setMuted(false);
    setMicConsent(false);
    setTranscriptSharing(false);
    setLeaseRemaining(null);
    setRemoteTracks([]);
    const activeLease = lease.current;
    lease.current = null;
    let finalizeLease: Promise<void> | null = null;
    if (activeLease && !activeLease.ended) {
      activeLease.ended = true;
      finalizeLease = malviBusinessClient.endMedia(activeLease.roomId, activeLease.leaseId, !activeLease.confirmed)
        .then(() => undefined)
        .catch(err => {
          if (activeRoomId.current === activeLease.roomId) setError(err instanceof Error ? err.message : 'Conference time could not be finalized.');
        });
    }
    if (active) {
      active.handlers.forEach(([event, handler]) => active.client.off(event, handler));
      const tracks = [active.mic, active.camera].filter(Boolean);
      tracks.forEach((track: any) => { try { track.stop(); track.close(); } catch { /* Already closed by the SDK. */ } });
      try {
        if (tracks.length) {
          await active.client.unpublish(tracks).catch(() => undefined);
        }
        if (active.client.connectionState !== 'DISCONNECTED') await active.client.leave();
      } catch { /* Cleanup is best effort when the browser or network has already disconnected. */ }
    }
    await finalizeLease;
  };

  const activeLeaseId = leaseRemaining === null ? null : lease.current?.leaseId ?? null;
  useEffect(() => {
    if (!activeLeaseId) return;
    const tick = () => {
      const activeLease = lease.current;
      if (!activeLease || activeLease.leaseId !== activeLeaseId || activeRoomId.current !== activeLease.roomId) return;
      const remaining = Math.max(0, activeLease.endsAt - Date.now());
      setLeaseRemaining(remaining);
      if (remaining <= 0) {
        setError('Reserved meeting time has ended. Join again only if the room owner opens a new meeting.');
        void dispose();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeaseId]);

  useEffect(() => {
    if (!room.meetingOpen) void dispose();
    return () => { void dispose(); };
    // Each room's server state controls whether local tracks may remain active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, room.meetingOpen]);

  useEffect(() => {
    if (!connected) return;
    if (session.current?.camera && localVideoContainer.current) {
      try { session.current.camera.play(localVideoContainer.current); } catch { /* Preview may already be attached. */ }
    }
    remoteTracks.forEach(remote => {
      if (!remote.videoTrack) return;
      const container = videoContainers.current.get(String(remote.uid));
      if (container) {
        try { remote.videoTrack.play(container); } catch { /* A replaced remote track will be played on the next render. */ }
      }
    });
  }, [connected, remoteTracks]);

  useEffect(() => {
    if (!connected || !room.meetingOpen) return;
    const roomId = room.id;
    const activeLease = lease.current;
    if (!activeLease || activeLease.roomId !== roomId) return;
    const leaseId = activeLease.leaseId;
    const sessionEpoch = epoch.current;
    let alive = true;
    let inFlight = false;
    const timer = window.setInterval(async () => {
      const currentLease = lease.current;
      if (!alive || inFlight || activeRoomId.current !== roomId || epoch.current !== sessionEpoch ||
          currentLease?.roomId !== roomId || currentLease.leaseId !== leaseId) return;
      inFlight = true;
      try {
        await malviBusinessClient.confirmMedia(roomId, leaseId);
      } catch (err) {
        if (alive && activeRoomId.current === roomId && epoch.current === sessionEpoch && lease.current?.leaseId === leaseId) {
          setError(err instanceof Error ? err.message : 'Meeting authorization heartbeat failed.');
          void dispose();
        }
      } finally {
        inFlight = false;
      }
    }, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
    // The server lease identity is captured once for this connected media session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, room.id, room.meetingOpen]);

  const joinMeeting = async () => {
    if (!room.meetingOpen || connecting || connected) return;
    const roomId = room.id;
    const currentEpoch = ++epoch.current;
    setConnecting(true); setError('');
    let client: any;
    let mic: any;
    let camera: any;
    let joined = false;
    let acquiredLease: Awaited<ReturnType<typeof malviBusinessClient.token>> | null = null;
    const handlers: Array<[string, (...args: any[]) => void]> = [];
    try {
      const credentials = await malviBusinessClient.token(roomId);
      acquiredLease = credentials;
      if (!credentials.leaseId || !Number.isFinite(credentials.endsAt) || credentials.endsAt <= Date.now()) {
        throw new Error('The server did not return an active, metered meeting reservation.');
      }
      if (epoch.current !== currentEpoch) {
        await malviBusinessClient.endMedia(roomId, credentials.leaseId, true);
        return;
      }
      lease.current = { roomId, leaseId: credentials.leaseId, endsAt: credentials.endsAt, confirmed: false, ended: false };
      setLeaseRemaining(Math.max(0, credentials.endsAt - Date.now()));
      client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      const addHandler = (event: string, handler: (...args: any[]) => void) => {
        client.on(event, handler);
        handlers.push([event, handler]);
      };
      addHandler('user-published', async (user: any, mediaType: 'audio' | 'video') => {
        if (epoch.current !== currentEpoch) return;
        try {
          await client.subscribe(user, mediaType);
          if (epoch.current !== currentEpoch) return;
          setRemoteTracks(previous => {
            const remaining = previous.filter(item => item.uid !== user.uid);
            return [...remaining, {
              uid: user.uid,
              audioTrack: user.audioTrack ?? (mediaType === 'audio' ? user.audioTrack : undefined),
              videoTrack: user.videoTrack ?? (mediaType === 'video' ? user.videoTrack : undefined),
            }];
          });
          if (mediaType === 'audio') user.audioTrack?.play();
        } catch (err) {
          if (epoch.current === currentEpoch) setError(err instanceof Error ? err.message : 'Could not subscribe to a participant track.');
        }
      });
      addHandler('user-unpublished', (user: any, mediaType: 'audio' | 'video') => {
        setRemoteTracks(previous => previous.map(item => item.uid !== user.uid ? item : {
          ...item, ...(mediaType === 'video' ? { videoTrack: undefined } : { audioTrack: undefined }),
        }).filter(item => item.videoTrack || item.audioTrack));
      });
      addHandler('user-left', (user: any) => {
        setRemoteTracks(previous => previous.filter(item => item.uid !== user.uid));
      });
      addHandler('connection-state-change', (state: string) => {
        if (state === 'DISCONNECTED' && epoch.current === currentEpoch) {
          setConnected(false);
          setError('The meeting connection ended. You can try joining again while the meeting is open.');
          void dispose();
        }
      });
      addHandler('token-privilege-will-expire', async () => {
        try {
          const refreshed = await malviBusinessClient.token(roomId, credentials.leaseId);
          if (refreshed.leaseId !== credentials.leaseId || !Number.isFinite(refreshed.endsAt) || refreshed.endsAt > credentials.endsAt) {
            throw new Error('The refreshed meeting token did not match the active reservation.');
          }
          if (epoch.current === currentEpoch && session.current?.roomId === roomId) await client.renewToken(refreshed.token);
        } catch (err) {
          if (epoch.current === currentEpoch) {
            setError(err instanceof Error ? err.message : 'Meeting authorization could not be refreshed.');
            await dispose();
          }
        }
      });
      await client.join(credentials.appId, credentials.channelName, credentials.token, credentials.uid);
      joined = true;
      if (epoch.current !== currentEpoch) { await client.leave(); return; }
      mic = await AgoraRTC.createMicrophoneAudioTrack();
      if (withCamera) {
        try { camera = await AgoraRTC.createCameraVideoTrack(); }
        catch (err) { setError(err instanceof Error ? `Camera unavailable; joining with microphone only. ${err.message}` : 'Camera unavailable; joining with microphone only.'); }
      }
      if (epoch.current !== currentEpoch) {
        [mic, camera].filter(Boolean).forEach((track: any) => { track.stop(); track.close(); });
        await client.leave(); return;
      }
      const tracks = [mic, camera].filter(Boolean);
      await client.publish(tracks);
      if (epoch.current !== currentEpoch) {
        await client.unpublish(tracks).catch(() => undefined);
        tracks.forEach((track: any) => { track.stop(); track.close(); });
        await client.leave(); return;
      }
      session.current = { client, roomId, epoch: currentEpoch, mic, camera, handlers };
      await malviBusinessClient.confirmMedia(roomId, credentials.leaseId);
      if (epoch.current !== currentEpoch || session.current?.roomId !== roomId) {
        await dispose();
        return;
      }
      if (lease.current) lease.current.confirmed = true;
      setConnected(true);
    } catch (err) {
      handlers.forEach(([event, handler]) => client?.off(event, handler));
      if (session.current?.roomId === roomId) session.current = null;
      [mic, camera].filter(Boolean).forEach((track: any) => { try { track.stop(); track.close(); } catch { /* Track already released. */ } });
      if (joined && client) await client.leave().catch(() => undefined);
      if (acquiredLease && lease.current?.leaseId === acquiredLease.leaseId && !lease.current.ended) {
        lease.current.ended = true;
        lease.current = null;
        try { await malviBusinessClient.endMedia(roomId, acquiredLease.leaseId, true); } catch { /* Preserve the original authorization or media error. */ }
      } else if (acquiredLease?.leaseId && !lease.current) {
        try { await malviBusinessClient.endMedia(roomId, acquiredLease.leaseId, true); } catch { /* Preserve the original authorization or media error. */ }
      }
      if (epoch.current === currentEpoch) setError(err instanceof Error ? err.message : 'Could not join the live meeting.');
    } finally {
      if (epoch.current === currentEpoch) setConnecting(false);
    }
  };

  const toggleMute = async () => {
    const active = session.current;
    if (!active?.mic) return;
    const nextMuted = !muted;
    try {
      await active.mic.setEnabled(!nextMuted);
      setMuted(nextMuted);
      if (nextMuted) stopTranscriptCapture();
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Microphone setting could not be changed.'); }
  };

  const startTranscriptCapture = () => {
    const active = session.current;
    const activeLease = lease.current;
    if (!active?.mic || !activeLease || activeLease.ended) {
      setError('Join the meeting before sharing a microphone transcript.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('This browser does not support microphone transcript capture.');
      return;
    }
    const mimeType = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setError('This browser cannot record a supported audio format for shared transcription.');
      return;
    }
    try {
      const sourceTrack = active.mic.getMediaStreamTrack();
      const stream = new MediaStream([sourceTrack.clone()]);
      const worker = { active: true, stream, recorder: null as any, timer: null as number | null, controller: null as AbortController | null, epoch: epoch.current };
      transcriptWorker.current = worker;
      setTranscriptSharing(true);
      const capture = async () => {
        while (worker.active && transcriptWorker.current === worker && epoch.current === worker.epoch) {
          try {
            const recorder = new MediaRecorder(stream, { mimeType });
            worker.recorder = recorder;
            const chunks: Blob[] = [];
            recorder.ondataavailable = (event: BlobEvent) => { if (event.data.size) chunks.push(event.data); };
            const stopped = new Promise<void>((resolve, reject) => {
              recorder.onstop = () => resolve();
              recorder.onerror = () => reject(new Error('The microphone transcript segment could not be recorded.'));
            });
            recorder.start();
            worker.timer = window.setTimeout(() => {
              if (recorder.state !== 'inactive') recorder.stop();
            }, 15000);
            await stopped;
            if (worker.timer !== null) window.clearTimeout(worker.timer);
            worker.timer = null;
            const blob = new Blob(chunks, { type: mimeType });
            if (!worker.active || !blob.size) continue;
            if (blob.size > 1024 * 1024) {
              setError('A transcript audio segment exceeded 1 MiB and was skipped.');
              continue;
            }
            const encoded = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result ?? '');
                const comma = result.indexOf(',');
                comma >= 0 ? resolve(result.slice(comma + 1)) : reject(new Error('The audio segment could not be encoded.'));
              };
              reader.onerror = () => reject(new Error('The audio segment could not be encoded.'));
              reader.readAsDataURL(blob);
            });
            if (!worker.active || epoch.current !== worker.epoch || lease.current?.leaseId !== activeLease.leaseId) break;
            const controller = new AbortController();
            worker.controller = controller;
            const response = await malviBusinessClient.transcribe(active.roomId, {
              leaseId: activeLease.leaseId,
              audio: { data: encoded, mimeType },
            }, controller.signal);
            worker.controller = null;
            if (worker.active && epoch.current === worker.epoch && lease.current?.leaseId === activeLease.leaseId) {
              if (response.text.trim()) onRoomUpdated(response.room);
            }
          } catch (err) {
            if (worker.active && epoch.current === worker.epoch && activeRoomId.current === active.roomId) {
              setError(err instanceof Error ? err.message : 'Shared transcription could not process this segment.');
              stopTranscriptCapture();
            }
            break;
          }
        }
      };
      void capture();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone transcript capture could not start.');
      stopTranscriptCapture();
    }
  };

  const toggleTranslation = async (messageId: string) => {
    if (visibleTranslations[messageId]) {
      setVisibleTranslations(current => ({ ...current, [messageId]: false }));
      return;
    }
    if (translations[messageId]) {
      setVisibleTranslations(current => ({ ...current, [messageId]: true }));
      return;
    }
    setTranslating(messageId);
    setError('');
    const requestEpoch = epoch.current;
    try {
      const result = await malviBusinessClient.translate(room.id, { messageId, targetLanguage: currentUserLanguage });
      if (epoch.current === requestEpoch && activeRoomId.current === room.id) {
        setTranslations(current => ({ ...current, [messageId]: result.text }));
        setVisibleTranslations(current => ({ ...current, [messageId]: true }));
      }
    } catch (err) {
      if (epoch.current === requestEpoch && activeRoomId.current === room.id) setError(err instanceof Error ? err.message : 'Translation could not be completed.');
    } finally {
      if (epoch.current === requestEpoch && activeRoomId.current === room.id) setTranslating(null);
    }
  };

  const leaveMeeting = async () => {
    setError('');
    await dispose();
  };

  const formatRemaining = (milliseconds: number | null) => {
    if (milliseconds === null) return '';
    const seconds = Math.ceil(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const toggleRoomMeeting = (open: boolean) => onCommand(open ? 'meeting open' : 'meeting close', id =>
    malviBusinessClient.command(id, { type: 'meeting', open }));

  return (
    <section className="overflow-hidden rounded-xl border border-[#dedbd3] bg-[#f5f3ec]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dedbd3] px-4 py-3">
        <div className="flex items-center gap-2.5"><span className={`grid h-8 w-8 place-items-center rounded-lg ${room.meetingOpen ? 'bg-[#e3ece4] text-[#48675a]' : 'bg-[#e9e6de] text-[#777971]'}`}><Video size={16}/></span><div><h3 className="text-sm font-semibold">Live meeting</h3><p className="text-[11px] text-[#777971]">{room.meetingOpen ? 'Room meeting is open' : 'No meeting is open'}</p></div></div>
        {owner && <button onClick={() => void toggleRoomMeeting(!room.meetingOpen)} disabled={connecting} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${room.meetingOpen ? 'border border-[#d5b5ad] bg-[#f8e9e4] text-[#82483e] hover:bg-[#f4dfd8]' : 'bg-[#344f49] text-[#fffdf7] hover:bg-[#263e39]'}`}>{room.meetingOpen ? 'Close meeting' : 'Open meeting'}</button>}
      </div>
      <div className="p-4">
        {room.meetingOpen ? <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-medium ${connected ? 'text-[#3e7054]' : 'text-[#777971]'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#5b8b66]' : 'bg-[#aaa99f]'}`}/>{connected ? 'Media connected' : connecting ? 'Connecting…' : 'Not connected'}</span>
            <span className="text-[#85867f]">Join is opt-in. Your microphone starts only after you choose Join.</span>
            {leaseRemaining !== null && <span className="font-medium text-[#686b64]">Reserved time {formatRemaining(leaseRemaining)} remaining</span>}
          </div>
          {!connected ? <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#5e625c]"><input type="checkbox" checked={micConsent} onChange={event=>setMicConsent(event.target.checked)} disabled={connecting} className="accent-[#48675a]"/>I agree to share my microphone in this meeting</label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#5e625c]"><input type="checkbox" checked={withCamera} onChange={event=>setWithCamera(event.target.checked)} disabled={connecting} className="accent-[#48675a]"/>Include camera when joining</label>
            <button onClick={() => void joinMeeting()} disabled={connecting || !micConsent} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#344f49] px-4 text-sm font-semibold text-[#fffdf7] hover:bg-[#263e39] disabled:opacity-50">{connecting ? <><LoaderCircle size={15} className="animate-spin"/>Joining</> : <><Headphones size={15}/>Join meeting</>}</button>
          </div> : <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void toggleMute()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#d8d4ca] bg-[#fffdf8] px-3 text-xs font-semibold hover:bg-[#eeece4]">{muted ? <MicOff size={14}/> : <Mic size={14}/>} {muted ? 'Unmute' : 'Mute'}</button>
            {session.current?.camera && <span className="inline-flex items-center gap-1 text-xs text-[#62665f]"><Camera size={14}/> Camera on</span>}
            <button onClick={() => void leaveMeeting()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#d5b5ad] bg-[#f8e9e4] px-3 text-xs font-semibold text-[#82483e] hover:bg-[#f4dfd8]"><VideoOff size={14}/>Leave meeting</button>
          </div>}
          {!connected && <p className="max-w-2xl text-[10px] leading-4 text-[#85867f]">Conference time is charged from token issuance. Leaving early ends the lease but does not guarantee a full refund.</p>}
          {connected && <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#d9d5cc] bg-[#fffdf8] px-3 py-2.5 text-xs leading-5 text-[#5e625c]">
            <input type="checkbox" checked={transcriptSharing} onChange={event=>event.target.checked ? startTranscriptCapture() : stopTranscriptCapture()} className="mt-0.5 accent-[#48675a]"/>
            <span><strong className="font-semibold text-[#414540]">Share my microphone transcript with this room</strong><span className="block text-[11px] text-[#777971]">Audio is sent in independent 15-second segments for transcription. Turn this off to stop capture and uploads.</span></span>
          </label>}
          {error && <p role="alert" className="rounded-lg border border-[#d7a49b] bg-[#f8e9e4] px-3 py-2 text-xs leading-5 text-[#803f35]">{error}</p>}
          {(remoteTracks.length > 0 || session.current?.camera) && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {session.current?.camera && <div className="relative aspect-video overflow-hidden rounded-lg bg-[#262c29]"><div className="h-full w-full" ref={node=>{localVideoContainer.current=node;}}/><span className="absolute bottom-2 left-2 rounded-md bg-[#202622]/75 px-2 py-1 text-[10px] text-[#f5f3ec]">You</span></div>}
            {remoteTracks.map(remote=><div key={String(remote.uid)} className="relative aspect-video overflow-hidden rounded-lg bg-[#262c29]"><div className="h-full w-full" ref={node=>{const key=String(remote.uid); if(node) videoContainers.current.set(key,node); else videoContainers.current.delete(key);}}/><span className="absolute bottom-2 left-2 rounded-md bg-[#202622]/75 px-2 py-1 text-[10px] text-[#f5f3ec]">Participant {String(remote.uid)}</span></div>)}
          </div>}
        </div> : <div className="flex items-start gap-2 text-xs leading-5 text-[#777971]"><Radio size={14} className="mt-0.5 shrink-0"/>The room owner can open a meeting for members. An open room meeting does not mean your device is connected.</div>}
      </div>
      {connected && room.messages.some(message => message.kind === 'assistant') && <div className="border-t border-[#dedbd3] px-4 py-3">
        <button disabled={reading} className="text-xs font-semibold underline disabled:opacity-50" onClick={async () => {
          const current = lease.current, generation = epoch.current;
          const message = room.messages.filter(m => m.kind === 'assistant').at(-1);
          if (!current || !message || current.ended) return;
          setReading(true); setError('');
          try {
            const speech = await malviBusinessClient.speak(room.id, { messageId: message.id, language: currentUserLanguage, leaseId: current.leaseId });
            if (generation !== epoch.current || current !== lease.current || current.ended) return;
            playback.current?.pause();
            playback.current = new Audio(`data:${speech.mimeType};base64,${speech.audioBase64}`);
            await playback.current.play();
          } catch (error) {
            if (generation === epoch.current) setError(error instanceof Error ? error.message : 'Malvi speech could not play.');
          } finally { if (generation === epoch.current) setReading(false); }
        }}>{reading ? 'Preparing Malvi speech…' : 'Hear Malvi’s latest response (up to 1,200 characters)'}</button>
        <p className="mt-1 text-[11px] text-[#777971]">Plays on your device in the administrator-selected Malvi voice.</p>
      </div>}
      {room.messages.some(message => message.kind === 'transcript') && <div className="space-y-2 border-t border-[#dedbd3] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#777971]">Transcript translation · {currentUserLanguage}</p>
        {room.messages.filter(message => message.kind === 'transcript').map(message=><div key={message.id} className="rounded-lg bg-[#fffdf8] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-[#777971]">{message.author} · shared transcript</span><button onClick={()=>void toggleTranslation(message.id)} disabled={translating === message.id} className="text-[11px] font-semibold text-[#49675c] underline decoration-[#aabbb0] underline-offset-2 disabled:opacity-50">{translating === message.id ? 'Langpretation…' : visibleTranslations[message.id] ? 'Hide Langpretation' : `Langpretation · ${currentUserLanguage}`}</button></div>
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-[#484b47]">{message.text}</p>
          {visibleTranslations[message.id] && translations[message.id] && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-[#484b47]">{translations[message.id]}</p>}
        </div>)}
      </div>}
    </section>
  );
};

export default BusinessMeeting;
