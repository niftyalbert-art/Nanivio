import { realtimeClient } from '../lib/realtimeClient';
import { LiveCallTranslation, TranslationPcmPlayer } from './liveCallTranslation';
import { supportsPalabraPair } from '../shared/palabraLanguages';

type Options = {
  roomId: string; userId: string; targetLanguage: string;
  onRemote: (rtcUid: number, active: boolean) => void;
  onTranscript: (p: { text: string; speakerId: string; translated: boolean; final: boolean }) => void;
  onError: (message: string) => void;
  onState: (state: 'off' | 'listening' | 'speaking') => void;
};
type Transport = Pick<typeof realtimeClient, 'on' | 'send'>;
export class BusinessLiveTranslation {
  private callId: string;
  private off: (() => void)[] = [];
  private players = new Map<string, { player: TranslationPcmPlayer; streamId: string; uid: number; last: number; audible: boolean }>();
  private output = new TranslationPcmPlayer();
  private capture: LiveCallTranslation;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private waiting: { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private listening = false;
  private speaking = false;
  private closed = false;
  constructor(private options: Options, private transport: Transport = realtimeClient) {
    this.callId = `business:${options.roomId}`;
    // Reuse the real existing streaming microphone engine, but isolate its
    // one-to-one receiver handling from the group's per-speaker players.
    const localTransport = {
      send: (type: string, payload: any) => transport.send(type, payload),
      on: (type: string, callback: (p: any) => void) =>
        ['langpretation:remote_start', 'langpretation:audio_out', 'langpretation:remote_stop', 'langpretation:transcript'].includes(type)
          ? () => {} : transport.on(type, callback),
    };
    this.capture = new LiveCallTranslation(this.callId, options.userId, {
      transcript: () => {}, remoteActive: () => {},
      stopped: () => { this.speaking = false; options.onState(this.listening ? 'listening' : 'off'); }, error: options.onError,
    }, localTransport);
    this.off.push(transport.on('langpretation:business_ready', p => {
      if (p.callId !== this.callId || this.closed || !this.waiting && !this.listening) return;
      if (p.targetLanguage !== options.targetLanguage) return this.fail('The meeting language changed. Reopen live Langpretation.');
      this.listening = true;
      if (this.waiting) { clearTimeout(this.waiting.timer); this.waiting.resolve(); this.waiting = null; }
      options.onState(this.speaking ? 'speaking' : 'listening');
    }));
    this.off.push(transport.on('langpretation:business_error', p => { if (p.callId === this.callId) this.fail(p.message || 'Meeting Langpretation could not connect.'); }));
    this.off.push(transport.on('langpretation:remote_start', p => {
      if (!this.listening || p.callId !== this.callId || p.speakerId === options.userId || typeof p.speakerId !== 'string') return;
      if (typeof p.streamId !== 'string' || !Number.isInteger(p.speakerRtcUid) || p.speakerRtcUid <= 0) return;
      const previous = this.players.get(p.speakerId);
      if (previous?.streamId === p.streamId) {
        transport.send('langpretation:receiver_ready', { callId: this.callId, speakerId: p.speakerId, streamId: p.streamId });
        return;
      }
      this.remove(p.speakerId);
      if (this.players.size >= 12) return this.fail('This meeting has reached its translated speaker limit.');
      try {
        const player = new TranslationPcmPlayer(this.output.captureContext());
        player.begin(p.streamId, Number.isInteger(p.sequence) && p.sequence >= 0 ? p.sequence : 0);
        this.players.set(p.speakerId, { player, streamId: p.streamId, uid: p.speakerRtcUid, last: Date.now(), audible: false });
        transport.send('langpretation:receiver_ready', { callId: this.callId, speakerId: p.speakerId, streamId: p.streamId });
      } catch { this.fail('Tap Listen again to enable translated audio.'); }
    }));
    this.off.push(transport.on('langpretation:audio_out', p => {
      if (!this.listening || p.callId !== this.callId) return;
      const speaker = this.players.get(p.speakerId);
      if (!speaker || speaker.streamId !== p.streamId) return;
      try {
        speaker.player.push(p); speaker.last = Date.now(); speaker.audible = true;
        options.onRemote(speaker.uid, true);
      } catch {
        this.remove(p.speakerId);
        options.onError('A translated stream could not play. Original meeting audio remains available.');
        transport.send('langpretation:playback_error', { callId: this.callId, speakerId: p.speakerId });
      }
    }));
    this.off.push(transport.on('langpretation:remote_stop', p => {
      if (p.callId === this.callId && this.players.get(p.speakerId)?.streamId === p.streamId) this.remove(p.speakerId);
    }));
    this.off.push(transport.on('langpretation:transcript', p => {
      if (this.listening && p.callId === this.callId && typeof p.text === 'string' && p.text.length <= 6000 && typeof p.speakerId === 'string') {
        options.onTranscript({ text: p.text, speakerId: p.speakerId, translated: p.translated === true, final: p.final === true });
      }
    }));
    this.off.push(transport.on('connection:lost', () => this.fail('Meeting connection lost. Original RTC audio is not replaced by Langpretation.')));
  }
  private remove(speakerId: string) {
    const entry = this.players.get(speakerId);
    if (!entry) return;
    entry.player.dispose(); this.options.onRemote(entry.uid, false); this.players.delete(speakerId);
  }
  private fail(message: string) {
    this.stopListening(); this.options.onError(message);
  }
  private stopListening() {
    this.listening = false; this.speaking = false; this.capture.stop();
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.watchdog) clearInterval(this.watchdog);
    this.heartbeat = null; this.watchdog = null;
    if (this.waiting) { clearTimeout(this.waiting.timer); this.waiting.reject(new Error('Meeting listening stopped.')); this.waiting = null; }
    for (const key of [...this.players.keys()]) this.remove(key);
    this.transport.send('langpretation:business_leave', { callId: this.callId }); this.options.onState('off');
  }
  async listen() {
    if (this.closed) throw new Error('Reopen meeting Langpretation.');
    if (this.listening) return;
    if (this.waiting) throw new Error('Meeting listening is still connecting.');
    await this.output.unlock();
    const ready = new Promise<void>((resolve, reject) => {
      this.waiting = { resolve, reject, timer: setTimeout(() => this.fail('Meeting Langpretation did not connect. Try Listen again.'), 10000) };
    });
    if (!this.transport.send('langpretation:business_listen', { callId: this.callId })) this.fail('The meeting connection is not ready.');
    await ready;
    if (this.closed || !this.listening) return;
    this.heartbeat = setInterval(() => {
      if (!this.transport.send('langpretation:business_listen', { callId: this.callId })) this.fail('Meeting listening disconnected.');
    }, 15000);
    this.watchdog = setInterval(() => {
      // Never suppress original meeting audio indefinitely after provider stalls.
      for (const entry of this.players.values()) if (entry.audible && Date.now() - entry.last > 4000 && !entry.player.isPlaying()) {
        entry.audible = false; this.options.onRemote(entry.uid, false);
      }
    }, 1000);
  }
  async start(track: MediaStreamTrack, sourceLanguage: string, voiceConsent: boolean) {
    if (!supportsPalabraPair(sourceLanguage, this.options.targetLanguage)) throw new Error('Choose a supported pair with different languages. You can still listen without sending speech.');
    if (track.readyState !== 'live' || track.kind !== 'audio') throw new Error('Enable the meeting microphone first.');
    if (!this.listening) await this.listen();
    if (this.closed || !this.listening) return false;
    const started = await this.capture.start(sourceLanguage, this.options.targetLanguage, voiceConsent, new MediaStream([track]));
    if (started) { this.speaking = true; this.options.onState('speaking'); }
    return started;
  }
  stopSpeaking() { this.speaking = false; this.capture.stop(); this.options.onState(this.listening ? 'listening' : 'off'); }
  dispose() {
    if (this.closed) return;
    this.closed = true; this.stopListening(); this.capture.dispose();
    this.off.forEach(off => off()); this.off = []; this.output.dispose();
  }
}
