/**
 * LiveAvatar LITE streaming protocol. One utterance spans all native-voice
 * packets; sealing each 400 ms packet restarts the renderer's speaking lifecycle.
 * https://docs.liveavatar.com/docs/lite-mode/events
 */
export class MalviAvatarAudioStream {
  private utteranceId: string | null = null;
  constructor(
    private send: (message: string) => void,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {}

  append(base64: string, ended = true) {
    if (!base64 || base64.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      throw new Error('Malvi’s avatar received invalid voice audio.');
    }
    const bytes = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes % 2) throw new Error('Malvi’s avatar received an incomplete voice sample.');
    this.utteranceId ??= this.uuid();
    const id = this.utteranceId;
    // Base64 lengths correspond to 400 ms initially, then one-second PCM
    // chunks. Boundaries are multiples of eight, preserving 16-bit samples.
    let offset = 0;
    while (offset < base64.length) {
      const length = offset === 0 ? 25_600 : 64_000;
      const audio = base64.slice(offset, offset + length);
      this.send(JSON.stringify({ type: 'agent.speak', event_id: id, audio }));
      offset += length;
    }
    if (ended) {
      this.send(JSON.stringify({ type: 'agent.speak_end', event_id: id }));
      this.utteranceId = null;
    }
    return id;
  }

  cancel() { this.utteranceId = null; }
}
