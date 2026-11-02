/**
 * Six explicitly approved provider checks, not browser/account delivery tests.
 * No retries or input synthesis. Requires an existing short consented recording.
 */
import 'dotenv/config';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {translateWithProductionProviders} from '../src/server/translationRouter.ts';
import {processStagedVoiceNote, VoiceNoteProcessingError} from '../src/server/voiceNotePipeline.ts';
import {parsePalabraWav, translatePalabraAudio} from '../src/server/palabraSpeech.ts';
import {wavDurationSeconds} from '../src/server/speechProviders.ts';

if (!process.argv.includes('--confirm-six-billable-checks')) {
  console.error('No requests made. Explicit approval is required for six billable checks.');
  process.exit(1);
}
const directory = 'generated-artifacts/chat-langpretation-checks';
const audio = await readFile('generated-artifacts/palabra-voice-reference.wav');
const input = parsePalabraWav(audio);
if (input.seconds > 6) throw new Error('Diagnostic input must not exceed six seconds.');
await mkdir(directory, {recursive:true});

type RequestRecord = {status?:number; elapsedMs:number; transportError?:boolean};
const results: Record<string,unknown>[] = [];
let requests: RequestRecord[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args:Parameters<typeof fetch>) => {
  const started = performance.now();
  try {
    const response = await originalFetch(...args);
    requests.push({status:response.status, elapsedMs:Math.round(performance.now()-started)});
    return response;
  } catch (error) {
    requests.push({transportError:true, elapsedMs:Math.round(performance.now()-started)});
    throw error;
  }
};

try {
  for (const mode of ['text','voice-note'] as const) {
    for (const target of ['fr','ak','lg']) {
      requests = [];
      const started = performance.now();
      const entry: Record<string,unknown> = {mode, source:'en', target};
      try {
        if (mode === 'text') {
          const result = await translateWithProductionProviders('Hello, how are you?', 'en', target);
          if (!result?.text?.trim() || result.text.trim() === 'Hello, how are you?') {
            throw new Error('No changed target-language text was returned.');
          }
          Object.assign(entry, {status:'output_received_not_linguistically_verified',
            translatedText:result.text, provider:result.provider});
        } else {
          const result = target === 'fr'
            ? await translatePalabraAudio(audio, 'en', target, AbortSignal.timeout(55_000), 60)
            : await processStagedVoiceNote(audio, 'en', target);
          const bytes = Buffer.from(result.audioBase64, 'base64');
          const duration = wavDurationSeconds(bytes);
          const translated = 'translatedText' in result ? result.translatedText : result.translatedTranscript;
          const recognized = 'text' in result ? result.text : result.transcript;
          if (!duration || !translated?.trim() || !recognized?.trim()) {
            throw new Error('No complete transcript and measurable WAV audio were returned.');
          }
          const audioFile = `${directory}/en-${target}.wav`;
          await writeFile(audioFile, bytes);
          Object.assign(entry, {status:'audio_received_not_listened', transcript:recognized,
            translatedText:translated, audioFile, durationSeconds:duration, bytes:bytes.length,
            provider:'providerChain' in result ? result.providerChain : result.provider});
        }
      } catch (error) {
        Object.assign(entry, {status:'failed',
          reason:error instanceof VoiceNoteProcessingError ? error.message
            : error instanceof Error && !/https?:|key|token/i.test(error.message)
              ? error.message.slice(0,220) : 'Provider check did not complete.',
          ...(error instanceof VoiceNoteProcessingError ? {failedStage:error.stage} : {})});
      }
      Object.assign(entry, {elapsedMs:Math.round(performance.now()-started),httpRequests:[...requests],
        websocketSessions:mode === 'voice-note' && target === 'fr' ? 1 : 0});
      results.push(entry);
      await writeFile(`${directory}/results.json`, JSON.stringify({
        checkedAt:new Date().toISOString(), inputSeconds:input.seconds, automaticRetries:0,
        browserRecordingTested:false, authenticatedAccountDeliveryTested:false, results,
      }, null, 2));
      console.log(JSON.stringify(entry));
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
