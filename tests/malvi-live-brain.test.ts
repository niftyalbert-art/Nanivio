import assert from 'node:assert/strict';
import test from 'node:test';
import { getLiveBrainProviderConfig } from '../src/server/assistant/brainProviderConfig.ts';
import { liveAvatarSetup } from '../src/server/assistant/liveAvatarService.ts';
import { hasSpeech, resamplePcm16kTo24k } from '../src/server/assistant/liveBrain.ts';
import { malviOpeningBoundary } from '../src/server/assistant/malviResponsePacing.ts';
import { MALVI_INTRODUCTION, malviGreetingInstruction } from '../src/server/assistant/malviSystemPrompt.ts';

test('Malvi introduces herself warmly without an unsolicited not-human disclaimer', () => {
  assert.match(MALVI_INTRODUCTION, /AI companion at Nanivio/);
  assert.doesNotMatch(MALVI_INTRODUCTION, /not a human|disclosure|cannot/i);
  assert.match(MALVI_INTRODUCTION, /preferred language/);
  assert.ok(malviGreetingInstruction('en').includes(MALVI_INTRODUCTION));
  assert.match(malviGreetingInstruction('fr'), /selected language/);
  assert.match(malviGreetingInstruction('fr'), /Do not give an English greeting/);
});

test('speech pacing releases a meaningful opening before the full response', () => {
  const boundary = malviOpeningBoundary(MALVI_INTRODUCTION);
  assert.equal(MALVI_INTRODUCTION.slice(0,boundary),"Hello, I'm Malvi, your AI companion at Nanivio.");
  assert.equal(malviOpeningBoundary('Hello'),0,'Do not bill one request per token');
  const decimal='Why is the value 1.25 useful here? More detail follows.';
  assert.equal(malviOpeningBoundary(decimal),decimal.indexOf('?')+1);
  const long = 'A clear and practical answer without punctuation '.repeat(6);
  const cut = malviOpeningBoundary(long);
  assert.ok(cut >= 64 && cut <= 180);
  assert.equal(long[cut],' ','An unpunctuated opening splits at a word boundary');
  const arabic = 'هذه إجابة واضحة ومفيدة عن السؤال المطروح؟ يمكن توضيح المزيد.';
  assert.ok(arabic.slice(0,malviOpeningBoundary(arabic)).endsWith('؟'));
});

test('configured provider credentials do not claim a live brain connection', () => {
  const keys = ['HEYGEN_API_KEY', 'AVATAR_ID', 'REDIS_URL', 'GEMINI_API_KEY', 'MALVI_BRAIN_PROVIDER', 'ELEVENLABS_API_KEY', 'MALVI_TTS_TRANSPORT'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.HEYGEN_API_KEY = 'fixture-avatar-key';
    process.env.AVATAR_ID = 'fixture-custom-avatar';
    process.env.REDIS_URL = 'redis://fixture.invalid:6379';
    process.env.GEMINI_API_KEY = 'fixture-brain-key';
    process.env.MALVI_BRAIN_PROVIDER = 'gemini';
    process.env.ELEVENLABS_API_KEY = 'fixture-speech-key';
    process.env.MALVI_TTS_TRANSPORT = 'direct';
    const setup = liveAvatarSetup();
    assert.equal(setup.configured, true);
    assert.equal(setup.brainConfigured, true);
    assert.equal(setup.brainConnected, false);
    delete process.env.GEMINI_API_KEY;
    const missing = liveAvatarSetup();
    assert.equal(missing.configured, false);
    assert.equal(missing.brainConfigured, false);
    assert.equal(missing.brainConnected, false);
    assert.ok(missing.missing.includes('GEMINI_API_KEY'));
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test('the live brain provider is selected explicitly and reports missing credentials without exposing values', () => {
  const oldProvider = process.env.MALVI_BRAIN_PROVIDER;
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.MALVI_BRAIN_PROVIDER = 'openai';
    const config = getLiveBrainProviderConfig();
    assert.equal(config.selectedProvider, 'openai');
    assert.equal(config.configured, false);
    assert.deepEqual(config.missing, ['OPENAI_API_KEY']);
    assert.equal(JSON.stringify(config).includes('test-key'), false);
    process.env.MALVI_BRAIN_PROVIDER = 'other';
    assert.equal(getLiveBrainProviderConfig().selectedProvider, null);
  } finally {
    if (oldProvider === undefined) delete process.env.MALVI_BRAIN_PROVIDER;
    else process.env.MALVI_BRAIN_PROVIDER = oldProvider;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGemini;
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
  }
});

test('silence does not count as live user activity, while voiced PCM does', () => {
  const silence = Buffer.alloc(3200);
  const voice = Buffer.alloc(3200);
  for (let i = 0; i < voice.length / 2; i += 1) voice.writeInt16LE(i % 2 ? 1800 : -1800, i * 2);
  assert.equal(hasSpeech(silence), false);
  assert.equal(hasSpeech(voice), true);
});

test('provider adapter resamples mono PCM16 from 16 kHz to 24 kHz', () => {
  const input = Buffer.alloc(16);
  for (let i = 0; i < input.length / 2; i += 1) input.writeInt16LE(i * 100, i * 2);
  const output = resamplePcm16kTo24k(input);
  assert.equal(output.length, 24);
  assert.equal(output.readInt16LE(0), 0);
  assert.ok(output.readInt16LE(output.length - 2) >= input.readInt16LE(input.length - 2));
});
