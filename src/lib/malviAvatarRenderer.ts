export interface MalviAvatarRenderer {
  sessionId: string | null;
  start(): Promise<void>;
  stop(): Promise<void>;
  attach(video: HTMLVideoElement): void;
  appendAudio(audio: string, ended: boolean): unknown;
  repeatAudio(audio: string): unknown;
  interrupt(): unknown;
  keepAlive(): Promise<void>;
  on(event: 'ready' | 'closed' | 'speech-start' | 'speech-end', listener: () => void): void;
}

export async function createMalviAvatarRenderer(info: {
  id: string; sessionToken: string; renderer?: 'heygen' | 'anam';
}): Promise<MalviAvatarRenderer> {
  if (info.renderer === 'anam') {
    const { MalviAnamAvatarSession } = await import('./malviAnamAvatarSession');
    return new MalviAnamAvatarSession(info.id, info.sessionToken);
  }
  const [{ SessionEvent, SessionMode, AgentEventsEnum }, { MalviLiveAvatarSession }] = await Promise.all([
    import('@heygen/liveavatar-web-sdk'), import('./malviLiveAvatarSession'),
  ]);
  const live = new MalviLiveAvatarSession(info.sessionToken, {
    autoKeepAlive: false, voiceChat: { defaultMuted: true },
  });
  if (live.mode !== SessionMode.LITE) throw new Error('A non-LITE renderer was refused.');
  // Muting alone still publishes a microphone with the current HeyGen SDK.
  live.voiceChat.start = async () => {};
  const events = {
    ready: SessionEvent.SESSION_STREAM_READY, closed: SessionEvent.SESSION_DISCONNECTED,
    'speech-start': AgentEventsEnum.AVATAR_SPEAK_STARTED, 'speech-end': AgentEventsEnum.AVATAR_SPEAK_ENDED,
  };
  return {
    get sessionId() { return live.sessionId || null; },
    async start() { await live.start(); await live.voiceChat.stop(); },
    stop: () => live.stop(), attach: video => live.attach(video),
    appendAudio: (audio, ended) => live.appendAudio(audio, ended),
    repeatAudio: audio => live.repeatAudio(audio), interrupt: () => live.interrupt(),
    keepAlive: async () => { await live.keepAlive(); },
    on: (event, listener) => { live.on(events[event] as any, listener); },
  };
}
