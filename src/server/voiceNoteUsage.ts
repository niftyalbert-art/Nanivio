import { createHash } from 'node:crypto';
import { SpeechProviderError, wavDurationSeconds } from './speechProviders.ts';

type VoiceNoteUsageContext = {
  userId: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
};

/** The processing endpoint owns the debit; message delivery never charges again. */
export async function recordTranslatedVoiceNoteUsage<T>(
  audio: Buffer,
  context: VoiceNoteUsageContext,
  recordUsage: (payload: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const audioSeconds = wavDurationSeconds(audio);
  if (!audioSeconds) throw new SpeechProviderError(400, 'A valid PCM WAV recording with measurable duration is required.');
  // Identical retries must reach the existing transactional usage-event deduplication.
  const eventId = 'voice_' + createHash('sha256')
    .update(JSON.stringify([context.userId, context.sourceLang, context.targetLang]))
    .update(audio).digest('hex');
  return recordUsage({
    ...context,
    eventId,
    channel: 'VOICE_NOTE',
    minutes: audioSeconds / 60,
    audioSeconds,
  });
}
