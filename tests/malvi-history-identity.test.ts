import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clearMalviHistory, loadMalviHistory, malviHistoryKey, saveMalviHistory } from '../src/lib/malviHistory.ts';
import { MALVI_IDENTITY, MALVI_IDENTITY_PROMPT, MALVI_INTRODUCTION, MALVI_SHARED_BEHAVIOR_POLICY } from '../src/shared/malviIdentity.ts';
import { buildMalviLiveInstructions, MALVI_INTRODUCTION as LIVE_INTRODUCTION } from '../src/server/assistant/malviSystemPrompt.ts';
import type { MalviChatMessage } from '../src/types';

function storage() {
  const data = new Map<string, string>();
  let writes = 0;
  return {
    data,
    get writes() { return writes; },
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}
const message = (text: string): MalviChatMessage => ({ id: text, sender: 'user', text, timestamp: 1 });

test('Malvi histories remain isolated when accounts alternate and reload', () => {
  const cache = storage();
  saveMalviHistory(cache, 'account-a', [message('private A')]);
  assert.deepEqual(loadMalviHistory(cache, 'account-b'), []);
  saveMalviHistory(cache, 'account-b', [message('private B')]);
  assert.deepEqual(loadMalviHistory(cache, 'account-a'), [message('private A')]);
  assert.deepEqual(loadMalviHistory(cache, 'account-b'), [message('private B')]);
  clearMalviHistory(cache, 'account-b');
  assert.deepEqual(loadMalviHistory(cache, 'account-b'), []);
  assert.deepEqual(loadMalviHistory(cache, 'account-a'), [message('private A')]);
});

test('unowned legacy history is never assigned, imported or deleted', () => {
  const cache = storage();
  const legacy = JSON.stringify([message('unknown owner')]);
  cache.setItem('nanivio_malvi_chat_history_v1', legacy);
  assert.deepEqual(loadMalviHistory(cache, 'next-account'), []);
  saveMalviHistory(cache, 'next-account', [message('new account conversation')]);
  clearMalviHistory(cache, 'next-account');
  assert.equal(cache.getItem('nanivio_malvi_chat_history_v1'), legacy);
});

test('anonymous owners never read, save or clear persisted conversations', () => {
  const cache = storage();
  saveMalviHistory(cache, null, [message('anonymous')]);
  saveMalviHistory(cache, ' ', [message('blank owner')]);
  clearMalviHistory(cache, null);
  assert.deepEqual(loadMalviHistory(cache, null), []);
  assert.equal(cache.data.size, 0);
  assert.notEqual(malviHistoryKey('a:b'), malviHistoryKey('a%3Ab'));
});

test('owner markers, format and messages must validate before restoring history', () => {
  const cache = storage();
  const key = malviHistoryKey('b')!;
  for (const record of [
    { version: 2, owner: 'a', messages: [message('A')] },
    { version: 1, owner: 'b', messages: [message('old')] },
    { version: 2, owner: 'b', messages: null },
    { version: 2, owner: 'b', messages: [null] },
    { version: 2, owner: 'b', messages: [{ ...message('bad'), text: {} }] },
    { version: 2, owner: 'b', messages: [{ ...message('bad'), sender: 'unknown' }] },
  ]) {
    cache.setItem(key, JSON.stringify(record));
    assert.deepEqual(loadMalviHistory(cache, 'b'), []);
  }
  cache.setItem(key, '{broken');
  assert.deepEqual(loadMalviHistory(cache, 'b'), []);
});

test('identical cross-tab snapshots do not trigger endless storage writes', () => {
  const cache = storage();
  const messages = [message('one')];
  saveMalviHistory(cache, 'a', messages);
  const writes = cache.writes;
  saveMalviHistory(cache, 'a', loadMalviHistory(cache, 'a'));
  assert.equal(cache.writes, writes);
});

test('browser storage failures remain observable instead of claiming persistence', () => {
  const unavailable = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
    removeItem() { throw new Error('storage unavailable'); },
  };
  assert.throws(() => loadMalviHistory(unavailable, 'a'), /storage unavailable/);
  assert.throws(() => saveMalviHistory(unavailable, 'a', []), /storage unavailable/);
  assert.throws(() => clearMalviHistory(unavailable, 'a'), /storage unavailable/);
});

test('every live language receives the same approved identity and shared trust policy', () => {
  assert.equal(MALVI_IDENTITY.fullName, 'Multimodal Advanced and Language Intellegent');
  assert.ok(MALVI_IDENTITY_PROMPT.includes(`MALVI stands for "${MALVI_IDENTITY.fullName}"`));
  assert.match(MALVI_IDENTITY_PROMPT, /do not repeat the expansion in every greeting/);
  assert.equal(MALVI_IDENTITY.company, 'Nanivio Tech. Gh.');
  assert.equal(MALVI_IDENTITY.founder, 'Mr. Albert Atta Nifty');
  assert.equal(LIVE_INTRODUCTION, MALVI_INTRODUCTION);
  for (const language of ['en', 'fr', 'ak', 'lg']) {
    const prompt = buildMalviLiveInstructions(language, 'gemini');
    assert.ok(prompt.includes(MALVI_IDENTITY_PROMPT));
    assert.ok(prompt.includes(MALVI_IDENTITY.fullName));
    assert.ok(prompt.includes(MALVI_SHARED_BEHAVIOR_POLICY));
    assert.doesNotMatch(prompt, /Kwabena Atta Panyi/);
    assert.match(prompt, /not verified account records/);
    assert.match(prompt, /no permission to execute purchases/);
  }
});

test('actual text endpoint and greeting consume the shared identity without conflicting legacy claims', () => {
  const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const chat = server.slice(server.indexOf('app.post("/api/malvi/chat"'), server.indexOf('// ============================================================================', server.indexOf('app.post("/api/malvi/chat"')));
  assert.ok(chat.includes('const systemInstruction = `${MALVI_IDENTITY_PROMPT}'));
  assert.ok(chat.includes('${MALVI_SHARED_BEHAVIOR_POLICY}'));
  assert.doesNotMatch(chat, /Kwabena Atta Panyi|ALWAYS reference these exact values|SYNCHRONIZED APP STATE|read only from the synced memory layer/);
  assert.match(chat, /UNVERIFIED CLIENT WORKSPACE CONTEXT/);
  const view = fs.readFileSync(new URL('../src/components/malvi/MalviView.tsx', import.meta.url), 'utf8');
  assert.match(view, /text: MALVI_INTRODUCTION/);
  assert.match(view, /\{MALVI_IDENTITY\.fullName\}/);
  assert.match(view, /key=\{ownerId\}/);
  assert.doesNotMatch(view, /nanivio_malvi_chat_history_v1|Kwabena Atta Panyi/);
});
