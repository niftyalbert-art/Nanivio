import assert from 'node:assert/strict';
import test from 'node:test';
import { languageMentioned } from '../src/server/assistant/languageControl.ts';
import { buildMalviLiveInstructions } from '../src/server/assistant/malviSystemPrompt.ts';

test('a voice language switch requires the user to name the language', () => {
  assert.equal(languageMentioned('Can you speak French please?', 'fr'), true);
  assert.equal(languageMentioned('Parle en français', 'fr'), true);
  assert.equal(languageMentioned('Please continue in Twi', 'ak'), true);
  assert.equal(languageMentioned('Speak Akan to me', 'ak'), true);
  assert.equal(languageMentioned('Parle anglais maintenant', 'en'), true);
  assert.equal(languageMentioned('Habla ingles por favor', 'en'), true);
  assert.equal(languageMentioned('Merci, what is the weather in Accra?', 'fr'), false);
  assert.equal(languageMentioned('', 'fr'), false);
});

test('Malvi instructions forbid switching language on her own', () => {
  const prompt = buildMalviLiveInstructions('en');
  assert.match(prompt, /always reply in the selected Nanivio language/);
  assert.match(prompt, /Never change language unless the user explicitly names the language/);
  assert.doesNotMatch(prompt, /answer in the user's language when you can/);
});

test('the language lock is the last instruction and names the selected language', () => {
  const prompt = buildMalviLiveInstructions('fr');
  assert.match(prompt.trim().split('\n').at(-1)!, /^LANGUAGE LOCK .*starts as French/);
});
