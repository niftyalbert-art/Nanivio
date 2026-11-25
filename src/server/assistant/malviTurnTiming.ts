/** Per-reply latency and continuity measurements for Malvi's live voice. */
export type MalviTurnTiming = {
  userAt: number;
  firstModelAudioAt: number;
  firstSentAt: number;
  lastSentAt: number;
  playUntil: number;
  maxGapMs: number;
  underruns: number;
  underrunMs: number;
  packets: number;
  audioMs: number;
};

export const newMalviTurnTiming = (): MalviTurnTiming => ({
  userAt: 0, firstModelAudioAt: 0, firstSentAt: 0, lastSentAt: 0, playUntil: 0,
  maxGapMs: 0, underruns: 0, underrunMs: 0, packets: 0, audioMs: 0,
});

/** An underrun is a packet that arrives after the previous audio would have finished playing. */
export function markMalviPacketSent(timing: MalviTurnTiming, durationMs: number, now = Date.now()) {
  if (!timing.firstSentAt) timing.firstSentAt = now;
  else {
    timing.maxGapMs = Math.max(timing.maxGapMs, now - timing.lastSentAt);
    if (now > timing.playUntil) { timing.underruns++; timing.underrunMs += now - timing.playUntil; }
  }
  timing.lastSentAt = now;
  timing.playUntil = Math.max(now, timing.playUntil) + Math.max(0, durationMs);
  timing.packets++;
  timing.audioMs += Math.max(0, durationMs);
}

export function malviTurnTimingSummary(timing: MalviTurnTiming) {
  const since = (from: number, to: number) => (from && to ? to - from : null);
  return {
    userToFirstModelAudioMs: since(timing.userAt, timing.firstModelAudioAt),
    userToFirstAudioSentMs: since(timing.userAt, timing.firstSentAt),
    modelToFirstAudioSentMs: since(timing.firstModelAudioAt, timing.firstSentAt),
    maxPacketGapMs: timing.packets > 1 ? timing.maxGapMs : null,
    underruns: timing.underruns,
    underrunMs: Math.round(timing.underrunMs),
    packets: timing.packets,
    audioMs: Math.round(timing.audioMs),
  };
}
