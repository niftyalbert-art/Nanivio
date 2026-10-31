import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wavDurationSeconds } from '../src/server/speechProviders.ts';
import { recordTranslatedVoiceNoteUsage } from '../src/server/voiceNoteUsage.ts';
import { PcmUtils } from '../src/lib/translator-engine/audio/pcm.ts';

// PCM fixture for unit arithmetic only: not captured media or a provider response.
function wav(seconds: number, channels = 1, bits = 16, sampleRate = 16000) {
  const blockAlign = channels * bits / 8;
  const dataSize = seconds * sampleRate * blockAlign;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF'); bytes.writeUInt32LE(36 + dataSize, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * blockAlign, 28);
  bytes.writeUInt16LE(blockAlign, 32); bytes.writeUInt16LE(bits, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

test('WAV seconds use byte rate, including sample width and channel count', () => {
  for (const channels of [1, 2]) for (const bits of [8, 16, 24, 32]) {
    assert.equal(wavDurationSeconds(wav(30, channels, bits)), 30);
  }
});

test('the actual client encoder produces a measurable 30-second, half-minute recording', async () => {
  const audio = Buffer.from(await PcmUtils.float32ToWavBlob(new Float32Array(30 * 16000), 16000).arrayBuffer());
  assert.equal(wavDurationSeconds(audio), 30);
  let calls = 0;
  await recordTranslatedVoiceNoteUsage(audio,
    { userId: 'unit-encoder', sourceLang: 'en', targetLang: 'ak', provider: 'unit-only' },
    async payload => { calls++; assert.equal(payload.minutes, 0.5); });
  assert.equal(calls, 1);
});

test('inconsistent or truncated WAV metadata cannot determine a debit', async () => {
  const audio = wav(1);
  audio.writeUInt32LE(16000, 28); // Invalid byte rate for 16-bit mono.
  assert.equal(wavDurationSeconds(audio), null);
  assert.equal(wavDurationSeconds(wav(1).subarray(0, 100)), null);
  await assert.rejects(recordTranslatedVoiceNoteUsage(audio,
    { userId: 'unit-account', sourceLang: 'en', targetLang: 'ak', provider: 'unit-only' },
    async () => { throw new Error('Invalid audio must never reach the usage writer'); }),
    /valid PCM WAV/);
});

test('a 30-second recording submits one half-minute event and retries use the same ledger key', async () => {
  const audio = wav(30), events = new Map<string, number>();
  const submissions: Record<string, unknown>[] = [];
  let remainingMinutes = 10;
  // Unit ledger boundary, not a production payment/balance claim.
  const writer = async (payload: Record<string, unknown>) => {
    submissions.push(payload);
    if (!events.has(String(payload.eventId))) {
      events.set(String(payload.eventId), Number(payload.minutes));
      remainingMinutes -= Number(payload.minutes);
    }
    return { remainingMinutes };
  };
  const context = { userId: 'unit-account', sourceLang: 'en', targetLang: 'ak', provider: 'unit-only' };
  assert.deepEqual(await recordTranslatedVoiceNoteUsage(audio, context, writer), { remainingMinutes: 9.5 });
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].audioSeconds, 30);
  assert.equal(submissions[0].channel, 'VOICE_NOTE');
  await recordTranslatedVoiceNoteUsage(audio, context, writer);
  assert.equal(events.size, 1);
  assert.equal(remainingMinutes, 9.5);
  assert.equal(submissions[0].eventId, submissions[1].eventId);
  await recordTranslatedVoiceNoteUsage(audio, { ...context, userId: 'another-unit-account' }, writer);
  assert.notEqual(submissions[0].eventId, submissions[2].eventId);
});

test('message delivery cannot translate, synthesize or debit a processed voice note again', () => {
  const context = readFileSync('src/context/NanivioContext.tsx', 'utf8');
  const voice = context.slice(context.indexOf('const sendVoiceNote = async ('), context.indexOf('const sendVoiceNote = async (') + 4600);
  assert.doesNotMatch(voice, /recordLangpretationUsage|translateText|generatePlayableWavBlob/);
  assert.match(voice, /server voice-note pipeline must complete/);
  const server = readFileSync('server.ts', 'utf8');
  const route = server.slice(server.indexOf('app.post("/api/langpretation/voice-note/process-audio"'), server.indexOf('// Malvi production voice input:'));
  // Integrated international and staged specialist paths are mutually exclusive.
  assert.equal((route.match(/await recordTranslatedVoiceNoteUsage\(/g) || []).length, 2);
  const international=route.slice(route.indexOf('if(supportsPalabraPair'),route.indexOf('const result=await processStagedVoiceNote'));
  assert.equal((international.match(/await recordTranslatedVoiceNoteUsage\(/g)||[]).length,1);
  assert.match(international,/return res\.json/);
  assert.match(route, /recordLangpretationUsagePersistent/);
  const migration = readFileSync('migrations/007_communication_plan_entitlements.sql', 'utf8');
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /WHERE event_id = v_event_id\s+AND user_id = p_user/);
});
