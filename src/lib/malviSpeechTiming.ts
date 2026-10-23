export interface MalviAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Provider timestamps are validated against the exact PCM sent to the avatar. */
export function validMalviAlignment(value: unknown, durationMs: number): value is MalviAlignment {
  if (!value || typeof value !== 'object') return false;
  const a = value as MalviAlignment;
  if (!Array.isArray(a.characters) || !a.characters.length || a.characters.length > 20_000
    || !Array.isArray(a.character_start_times_seconds) || !Array.isArray(a.character_end_times_seconds)
    || a.characters.length !== a.character_start_times_seconds.length
    || a.characters.length !== a.character_end_times_seconds.length) return false;
  return a.characters.every((c, i) => typeof c === 'string' && c.length > 0 && c.length <= 8
    && Number.isFinite(a.character_start_times_seconds[i]) && Number.isFinite(a.character_end_times_seconds[i])
    && a.character_start_times_seconds[i] >= 0
    && a.character_end_times_seconds[i] >= a.character_start_times_seconds[i]
    && a.character_end_times_seconds[i] * 1000 <= durationMs + 250
    && (!i || a.character_start_times_seconds[i] >= a.character_start_times_seconds[i - 1]));
}

export interface MalviCaptionTrack { alignment: MalviAlignment; durationMs: number }

/** Gemini Live has no word timestamps. Never describe this pacing as alignment. */
export function estimatedMalviCaptionTrack(text: unknown, durationMs: number, speechDurationMs = durationMs): MalviCaptionTrack {
  if (typeof text !== 'string' || !text.trim() || text.length > 1200
    || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 62_500
    || !Number.isFinite(speechDurationMs) || speechDurationMs <= 0 || speechDurationMs > durationMs) {
    throw new Error('Gemini subtitle text or duration is invalid.');
  }
  const characters = Array.from(text);
  const step = speechDurationMs / characters.length / 1000;
  return { durationMs, alignment: {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * step),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * step),
  } };
}

export function malviCaptionAt(track: MalviCaptionTrack, elapsedMs: number | null) {
  if (elapsedMs === null || elapsedMs < 0 || elapsedMs >= track.durationMs) return '';
  let visible = '';
  for (let i = 0; i < track.alignment.characters.length; i++) {
    if (track.alignment.character_start_times_seconds[i] * 1000 > elapsedMs) break;
    visible += track.alignment.characters[i];
  }
  // Keep recent spoken text in a small readable area, not an entire response.
  return Array.from(visible).slice(-110).join('').trim();
}

/** Clock comes from actual avatar/video or AudioContext playback, never token arrival. */
export class MalviCaptionPlayer {
  private pending: MalviCaptionTrack[] = [];
  private active: MalviCaptionTrack | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private update: (text: string, speaking: boolean) => void) {}
  enqueue(track: MalviCaptionTrack) {
    if (!validMalviAlignment(track.alignment, track.durationMs) || this.pending.length >= 3) {
      throw new Error('Malvi’s subtitle timing is unavailable.');
    }
    this.pending.push(track);
    return track;
  }
  start(clock: () => number | null, track?: MalviCaptionTrack) {
    if (!track && this.active) return; // Duplicate avatar start notification.
    const next = track || this.pending[0];
    if (!next || !this.pending.includes(next)) return;
    this.stopTimer();
    this.pending.splice(this.pending.indexOf(next), 1);
    this.active = next;
    const tick = () => {
      const elapsed = clock();
      this.update(malviCaptionAt(next, elapsed), elapsed !== null && elapsed >= 0 && elapsed < next.durationMs);
    };
    tick();
    this.timer = setInterval(tick, 40);
  }
  finish(track?: MalviCaptionTrack) {
    if (track && this.active !== track) return;
    this.stopTimer();
    this.active = null;
    this.update('', false);
  }
  cancel() { this.pending = []; this.finish(); }
  private stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

/** Meter uses captured PCM, not a simulated listening animation. */
export function malviInputLevel(encoded: string) {
  const raw = atob(encoded);
  if (!raw.length || raw.length % 2) return 0;
  let energy = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const unsigned = raw.charCodeAt(i) | raw.charCodeAt(i + 1) << 8;
    const sample = (unsigned >= 32768 ? unsigned - 65536 : unsigned) / 32768;
    energy += sample * sample;
  }
  return Math.min(1, Math.sqrt(energy / (raw.length / 2)) * 5);
}
