import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { malviPublicCopy } from '../src/lib/malviPublicCopy.ts';
import { MALVI_WELCOME_MESSAGES, selectMalviWelcome } from '../src/shared/malviIdentity.ts';
import { malviGreetingInstruction } from '../src/server/assistant/malviSystemPrompt.ts';

test('customer diagnostics use Nanivio branding while retaining actionable error codes', () => {
  const text = malviPublicCopy('ElevenLabs unavailable (HTTP 401; quota_exceeded). Gemini Live, OpenAI GPT-Live, LiveAvatar LITE. ELEVENLABS_API_KEY');
  assert.doesNotMatch(text, /ElevenLabs|Gemini|OpenAI|LiveAvatar|API_KEY/i);
  assert.match(text, /HTTP 401; quota_exceeded/);
  assert.equal(malviPublicCopy('Open Google Maps or Google Search'), 'Open Nanivio map or Nanivio search');
  assert.equal(malviPublicCopy('Source: Wikipedia https://en.wikipedia.org/wiki/Test'), 'Source: Wikipedia https://en.wikipedia.org/wiki/Test');
});

test('welcome messages vary without fabricating remembered conversations', () => {
  const selected = Array.from({ length: 12 }, () => selectMalviWelcome(() => 0));
  assert.ok(new Set(selected).size > 1);
  selected.forEach((text, index) => {
    assert.ok(MALVI_WELCOME_MESSAGES.includes(text as any));
    if (index) assert.notEqual(text, selected[index - 1]);
    assert.match(text, /AI companion/);
  });
  assert.match(malviGreetingInstruction('en'), /not a script|not a fixed script/);
  assert.match(malviGreetingInstruction('en'), /fresh, natural opening/);
  assert.match(malviGreetingInstruction('fr', true), /continue their previous conversation/);
  assert.match(malviGreetingInstruction('fr', true), /Do not repeat your name/);
});

test('customer copy is concise and maps keep external navigation semantics', () => {
  const controls = readFileSync('src/components/malvi/MalviLiveAssistant.tsx', 'utf8');
  assert.doesNotMatch(controls, /Local wake setup checks your browser/);
  assert.match(controls, /If your browser doesn’t support it/);
  assert.match(controls, /readiness\?\.canManageVoice && readiness.voiceOptions/);
  const map = readFileSync('src/components/malvi/MalviAssetResults.tsx', 'utf8');
  assert.match(map, /Open Nanivio map/);
  assert.match(map, /external navigation service/);
  assert.doesNotMatch(map, /Open Google Maps/);
});
