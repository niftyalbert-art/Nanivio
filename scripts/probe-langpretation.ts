/**
 * Explicitly billable diagnostic: at most one MT, one TTS and one ASR request
 * per existing provider. ASR uses genuine provider-produced WAV, never silence.
 * Does not save audio, use a microphone, alter accounts, or retry requests.
 */
import 'dotenv/config';
import { callKhayaEngine, callSunbirdEngine } from '../src/server/translationProviders.ts';
import { synthesizeProviderAudio, transcribeProviderAudio, wavDurationSeconds, SpeechProviderError } from '../src/server/speechProviders.ts';

if (!process.argv.includes('--confirm-billable')) {
  console.error('No requests made. Add --confirm-billable to authorize up to six provider requests.');
  process.exit(1);
}

const results: Record<string, unknown>[] = [];
for (const provider of ['khaya', 'sunbird'] as const) {
  const language = provider === 'khaya' ? 'ak' : 'lg';
  const phrase = provider === 'khaya' ? 'Maakye.' : 'Wasuze otya?';
  const configured = Boolean(process.env[provider === 'khaya' ? 'KHAYA_API_KEY' : 'SUNBIRD_API_KEY']);
  if (!configured) {
    results.push({ provider, status: 'not_configured', requests: 0 });
    continue;
  }
  const start = Date.now();
  const translation = await (provider === 'khaya' ? callKhayaEngine : callSunbirdEngine)('Good morning.', 'en', language);
  results.push({ provider, stage: 'translation', source: 'en', target: language,
    status: translation?.text && translation.text !== 'Good morning.' ? 'output_received_not_linguistically_verified' : 'failed_or_unchanged',
    characters: translation?.text.length || 0, elapsedMs: Date.now() - start });

  let audio: Buffer | undefined;
  try {
    const start = Date.now();
    const speech = await synthesizeProviderAudio(phrase, language);
    audio = Buffer.from(speech.audioBase64, 'base64');
    results.push({ provider, stage: 'synthesis', language, status: 'audio_received_not_listened',
      bytes: audio.length, durationSeconds: wavDurationSeconds(audio), elapsedMs: Date.now() - start });
  } catch (error) {
    results.push({ provider, stage: 'synthesis', language, status: 'failed',
      reason: error instanceof SpeechProviderError ? error.message : 'Unexpected provider error.' });
  }
  if (!audio || !wavDurationSeconds(audio)) {
    results.push({ provider, stage: 'recognition', language, status: 'not_tested_no_valid_wav_sample' });
    continue;
  }
  try {
    const start = Date.now();
    const recognized = await transcribeProviderAudio(audio, language);
    results.push({ provider, stage: 'recognition', language, status: 'transcript_received_not_linguistically_verified',
      characters: recognized.text.length, elapsedMs: Date.now() - start });
  } catch (error) {
    results.push({ provider, stage: 'recognition', language, status: 'failed',
      reason: error instanceof SpeechProviderError ? error.message : 'Unexpected provider error.' });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), maxRequests: 6, automaticRetries: 0,
  physicalMicrophoneTested: false, humanPlaybackVerified: false, results }, null, 2));
