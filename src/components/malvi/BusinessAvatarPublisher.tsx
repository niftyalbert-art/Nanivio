import React, { useEffect, useRef, useState } from 'react';
import type { BusinessRoom } from '../../types/malviBusiness';
import { malviBusinessClient } from '../../lib/malviBusinessClient';

/** Only the consenting meeting owner hosts the one actual avatar renderer.
 * Its synchronized audio/video are published as a separate RTC participant;
 * no microphone is opened and no independent local TTS track competes with it.
 */
export function BusinessAvatarPublisher({ room, leaseId, onRunningChange }: { room: BusinessRoom; leaseId: string; onRunningChange?: (running: boolean) => void }) {
  const [busy, setBusy] = useState(false), [running, setRunning] = useState(false), [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null), generation = useRef(0);
  const active = useRef<{ id: string; sdk: any; rtc: any; tracks: any[]; pulse: ReturnType<typeof setInterval> | null; endsAt: number } | null>(null);
  const heard = useRef(new Set<string>()), speaking = useRef(false);
  const [speechRevision, setSpeechRevision] = useState(0);
  useEffect(() => { onRunningChange?.(running); return () => onRunningChange?.(false); }, [running, onRunningChange]);
  const currentRoom = useRef(room); currentRoom.current = room;
  async function stop() {
    generation.current++; const session = active.current; active.current = null;
    speaking.current = false; setRunning(false); setBusy(false);
    if (!session) return;
    if (session.pulse) clearInterval(session.pulse);
    try { await session.rtc?.unpublish(session.tracks); } catch {}
    session.tracks.forEach(track => { try { track.stop(); track.close(); } catch {} });
    await Promise.allSettled([session.rtc?.leave(), session.sdk?.stop(), malviBusinessClient.endAvatar(room.id, session.id)]);
  }
  useEffect(() => () => { void stop(); }, [room.id, leaseId]);
  useEffect(() => { if (!room.meetingOpen || !room.copilotEnabled) void stop(); }, [room.meetingOpen, room.copilotEnabled]);

  async function start() {
    const epoch = ++generation.current;
    setBusy(true); setError('');
    let created: Awaited<ReturnType<typeof malviBusinessClient.avatar>> | undefined;
    let resources: typeof active.current = null;
    try {
      created = await malviBusinessClient.avatar(room.id, leaseId);
      if (epoch !== generation.current) { await malviBusinessClient.endAvatar(room.id, created.session.id); return; }
      const [{ default: AgoraRTC }, { SessionEvent }, { MalviLiveAvatarSession }] = await Promise.all([
        import('agora-rtc-sdk-ng'), import('@heygen/liveavatar-web-sdk'), import('../../lib/malviLiveAvatarSession'),
      ]);
      if (epoch !== generation.current) { await malviBusinessClient.endAvatar(room.id, created.session.id); return; }
      const sdk = new MalviLiveAvatarSession(created.session.sessionToken, { autoKeepAlive: false, voiceChat: { defaultMuted: true } });
      const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      const session = { id: created.session.id, sdk, rtc, tracks: [] as any[], pulse: null as ReturnType<typeof setInterval> | null,
        endsAt: Math.min(created.endsAt, created.session.hardDeadline) };
      active.current = session;
      resources = session;
      rtc.on('connection-state-change', state => {
        if (state === 'DISCONNECTED' && active.current === session) {
          setError('Malvi’s meeting media disconnected. The team call remains available.'); void stop();
        }
      });
      sdk.on(SessionEvent.SESSION_DISCONNECTED, () => { if (active.current === session) { setError('Malvi’s avatar disconnected. The team meeting continues.'); void stop(); } });
      sdk.on(SessionEvent.SESSION_STREAM_READY, () => { if (active.current === session && video.current) sdk.attach(video.current); });
      await sdk.start();
      if (video.current) sdk.attach(video.current);
      let stream: MediaStream | null = null;
      for (let n = 0; n < 80 && epoch === generation.current; n++) {
        stream = video.current?.srcObject instanceof MediaStream ? video.current.srcObject : null;
        if (stream?.getVideoTracks().some(t => t.readyState === 'live')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (epoch !== generation.current || !stream?.getVideoTracks().length) throw new Error('Malvi’s live video was not ready. Your team call remains available.');
      await rtc.join(created.media.appId, created.media.channelName, created.media.token, created.media.uid);
      if (epoch !== generation.current) throw new Error('Avatar start cancelled.');
      session.tracks = [
        AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: stream.getVideoTracks()[0].clone() }),
        ...stream.getAudioTracks().filter(t => t.readyState === 'live').map(track => AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: track.clone() })),
      ];
      if (session.tracks.length < 2) throw new Error('Malvi’s synchronized audio track was not ready.');
      await rtc.publish(session.tracks);
      if (epoch !== generation.current) throw new Error('Avatar start cancelled.');
      let pulseBusy = false;
      session.pulse = setInterval(() => {
        if (session.endsAt <= Date.now()) { void stop(); return; }
        if (pulseBusy) return;
        pulseBusy = true;
        void malviBusinessClient.avatarActivity(room.id, session.id).then(() => session.sdk.keepAlive()).catch(() => {
          setError('Malvi’s meeting allowance or connection ended.'); void stop();
        }).finally(() => { pulseBusy = false; });
      }, 15000);
      // Do not replay old room history when a new paid avatar is invited.
      heard.current = new Set(currentRoom.current.messages.filter(m => m.kind === 'assistant').map(m => m.id));
      setRunning(true);
    } catch (error) {
      if (epoch === generation.current) { setError(error instanceof Error ? error.message : 'The avatar could not join.'); await stop(); }
      else {
        if (resources) {
          resources.tracks.forEach(track => { try { track.stop(); track.close(); } catch {} });
          await Promise.allSettled([resources.rtc?.leave(), resources.sdk?.stop()]);
        }
        if (created) await malviBusinessClient.endAvatar(room.id, created.session.id).catch(() => {});
      }
    } finally { if (epoch === generation.current) setBusy(false); }
  }
  useEffect(() => {
    if (!running || speaking.current || !active.current) return;
    const next = room.messages.find(m => m.kind === 'assistant' && !heard.current.has(m.id));
    if (!next) return;
    const session = active.current, epoch = generation.current;
    heard.current.add(next.id); speaking.current = true;
    void (async () => {
      try {
        let offset: number | null = 0;
        while (offset !== null && active.current === session && epoch === generation.current) {
          if (Date.now() >= session.endsAt) throw new Error('The avatar meeting allowance has ended.');
          const speech = await malviBusinessClient.speak(room.id, { messageId: next.id, language: room.meetingLanguage || 'en', leaseId, offset });
          if (active.current !== session || epoch !== generation.current) return;
          const wav = atob(speech.audioBase64);
          if (wav.slice(0, 4) !== 'RIFF' || wav.length <= 44) throw new Error('The avatar received invalid speech audio.');
          offset = speech.nextOffset ?? null;
          session.sdk.appendAudio(btoa(wav.slice(44)), offset === null);
        }
      } catch (error) {
        if (epoch === generation.current) {
          session.sdk.interrupt();
          setError(error instanceof Error ? error.message : 'Malvi could not speak this response. The shared text remains available.');
        }
      } finally { if (epoch === generation.current) { speaking.current = false; setSpeechRevision(n => n + 1); } }
    })();
  }, [room.messages, running, leaseId, room.meetingLanguage, room.id, speechRevision]);
  return <div className="mt-3 rounded-xl border border-[#d8d4ca] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs font-semibold">Malvi live co-pilot</p><p className="text-[11px] text-[#777971]">One shared avatar uses this meeting’s reserved minutes. Only shared transcripts are considered.</p></div>
      <button type="button" disabled={busy} onClick={() => running ? void stop() : void start()} className="rounded-lg border border-[#c5c8ba] px-3 py-2 text-xs disabled:opacity-50">
        {busy ? 'Connecting avatar…' : running ? 'Remove avatar' : 'Invite avatar on video'}
      </button>
    </div>
    <video ref={video} muted playsInline autoPlay hidden={!running} className="mt-2 max-h-48 w-full rounded-lg object-contain" />
    {running && <p className="mt-1 text-[11px] text-[#777971]">Malvi’s synchronized video and voice are shared as a separate meeting participant.</p>}
    {error && <p role="alert" className="mt-2 text-xs text-[#82483e]">{error}</p>}
  </div>;
}
