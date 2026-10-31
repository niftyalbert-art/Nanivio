import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTranslatedVoiceNote } from '../src/lib/voiceNotePreparation.ts';
import { readFileSync } from 'node:fs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('original upload and speech processing start together, rather than waiting for one another', async () => {
  const upload = deferred<string>(), speech = deferred<{ audio: string }>();
  const started: string[] = [];
  const result = prepareTranslatedVoiceNote('blob:original',
    url => { assert.equal(url, 'blob:original'); started.push('upload'); return upload.promise; },
    () => { started.push('speech'); return speech.promise; },
  );
  await flush();
  assert.deepEqual(started, ['upload', 'speech']);
  let ready = false;
  result.then(() => { ready = true; });
  speech.resolve({ audio: 'blob:translated' });
  await flush();
  assert.equal(ready, false, 'Publishing must wait until original audio is durable.');
  upload.resolve('https://media.example/original.webm');
  assert.deepEqual(await result, {
    originalAudioUrl: 'https://media.example/original.webm',
    translation: { audio: 'blob:translated' },
    uploadFailed: false,
  });
});

test('a successful upload still waits for the actual speech result', async () => {
  const speech = deferred<string>();
  let ready = false;
  const result = prepareTranslatedVoiceNote('blob:original',
    async () => 'https://media.example/original.webm', () => speech.promise);
  result.then(() => { ready = true; });
  await flush();
  assert.equal(ready, false);
  speech.resolve('paid translation');
  assert.equal((await result).translation, 'paid translation');
});

test('an upload failure retains paid translation and original local recording for explicit retry', async () => {
  let speechCalls = 0;
  const result = await prepareTranslatedVoiceNote('blob:original',
    async () => { throw new Error('fixture upload failure'); },
    async () => { speechCalls++; return { audio: 'blob:translated', transcript: 'fixture' }; });
  assert.equal(result.uploadFailed, true);
  assert.equal(result.originalAudioUrl, 'blob:original');
  assert.equal(result.translation.audio, 'blob:translated');
  assert.equal(speechCalls, 1);
});

test('speech failure cannot be mistaken for a sendable translation; upload errors are observed too', async () => {
  const upload = deferred<string>(), speech = deferred<string>();
  const result = prepareTranslatedVoiceNote('blob:original', () => upload.promise, () => speech.promise);
  const rejected = assert.rejects(result, /fixture speech failure/);
  speech.reject(new Error('fixture speech failure'));
  await rejected;
  upload.reject(new Error('fixture upload failure'));
  await flush();
});

test('callers without an early-upload hook retain the existing authenticated send path', async () => {
  assert.deepEqual(await prepareTranslatedVoiceNote('blob:original', undefined, async () => 'translated'), {
    originalAudioUrl: 'blob:original', translation: 'translated', uploadFailed: false,
  });
});

test('chat wires early upload through membership-checked context and retains the recording when it fails', () => {
  const view = readFileSync('src/components/chat/ChatView.tsx', 'utf8');
  const context = readFileSync('src/context/NanivioContext.tsx', 'utf8');
  const recorder = readFileSync('src/components/chat/VoiceNoteRecorder.tsx', 'utf8');
  assert.match(view, /onPrepareOriginal=\{prepareVoiceNoteOriginal\}/);
  const preparation = context.slice(context.indexOf('const prepareVoiceNoteOriginal ='), context.indexOf('const sendVoiceNote ='));
  assert.ok(preparation.indexOf('await privateConversationChannel') < preparation.indexOf('return durableChatMedia'));
  assert.match(preparation, /privateConversationChannel\(conversation, currentUser\.id\)/);
  assert.match(recorder, /prepareTranslatedVoiceNote\(originalAudioBlobUrl,onPrepareOriginal,/);
  assert.match(recorder, /if\(prepared\.uploadFailed\)\{\s*setPreparedVoiceNote\(payload\)/);
  assert.match(recorder, /Translating and uploading/);
});
