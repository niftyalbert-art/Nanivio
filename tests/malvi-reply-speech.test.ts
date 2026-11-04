import test from 'node:test';
import assert from 'node:assert/strict';
import { createMalviReplySynthesizer } from '../src/server/assistant/malviReplySpeech.ts';
import { readFileSync } from 'node:fs';

test('English and Arabic text replies use the live Sulafat signature, not generic speech', async () => {
  const requests: any[] = [];
  const synthesize = createMalviReplySynthesizer({
    voice: async () => 'gemini', env: () => ({ GEMINI_API_KEY: 'fixture' }),
    generate: async request => {
      requests.push(request);
      return { candidates: [{ content: { parts: [{ inlineData: {
        mimeType: 'audio/pcm;rate=24000', data: Buffer.alloc(480, 1).toString('base64'),
      } }] } }] } as any;
    },
    eleven: async () => { throw new Error('Unexpected alternate provider'); },
  });
  for (const language of ['en', 'ar']) {
    const result = await synthesize('Sample reply', language);
    assert.equal(result.provider, 'malvi-gemini');
    assert.equal(result.contentType, 'audio/wav');
    assert.ok(result.durationSeconds > 0);
    assert.equal(Buffer.from(result.audioBase64, 'base64').toString('ascii', 0, 4), 'RIFF');
  }
  for (const request of requests) {
    assert.equal(request.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
    assert.match(request.contents, /female voice, speaker identity and feminine timbre/);
  }
  const source = readFileSync('server.ts', 'utf8');
  assert.match(source, /purpose==='MALVI'\?await synthesizeMalviReply\(text,language\)/);
});

test('signature failure does not fall back to a language voice or a different provider', async () => {
  let other = 0;
  const synthesize = createMalviReplySynthesizer({
    voice: async () => 'gemini', env: () => ({ GEMINI_API_KEY: 'fixture' }),
    generate: async () => { throw new Error('Provider unavailable'); },
    eleven: async () => { other++; return Buffer.alloc(480); },
  });
  await assert.rejects(synthesize('مرحبا', 'ar'), /No alternate voice was used/);
  await assert.rejects(synthesize('Sample', 'xx'), /No alternate voice was used/);
  await assert.rejects(synthesize('x'.repeat(1201), 'ar'), /1–1200/);
  assert.equal(other, 0);
});

test('explicit ElevenLabs selection stays on that voice when Arabic is selected', async () => {
  let generated = false;
  const languages: string[] = [];
  const synthesize = createMalviReplySynthesizer({
    voice: async () => 'elevenlabs', env: () => ({ ELEVENLABS_API_KEY: 'fixture' }),
    generate: async () => { generated = true; throw new Error('Unexpected provider'); },
    eleven: async (_text, language) => { languages.push(language); return Buffer.alloc(480); },
  });
  await synthesize('Hello', 'en'); await synthesize('مرحبا', 'ar');
  assert.deepEqual(languages, ['en', 'ar']);
  assert.equal(generated, false);
});

test('audio with a different sample rate cannot change Malvi’s playback pitch', async () => {
  const synthesize = createMalviReplySynthesizer({
    voice: async () => 'gemini', env: () => ({ GEMINI_API_KEY: 'fixture' }),
    generate: async () => ({ candidates: [{ content: { parts: [{ inlineData: {
      mimeType: 'audio/pcm;rate=16000', data: Buffer.alloc(480).toString('base64'),
    } }] } }] }) as any,
  });
  await assert.rejects(synthesize('مرحبا', 'ar'), /No alternate voice was used/);
});
