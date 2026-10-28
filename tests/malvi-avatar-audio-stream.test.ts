import assert from 'node:assert/strict';
import test from 'node:test';
import { MalviAvatarAudioStream } from '../src/lib/malviAvatarAudioStream.ts';
import { deliverMalviAudio } from '../src/lib/malviLiveClient.ts';

test('multiple voice packets form one utterance; only final packet seals it', () => {
  const messages: any[] = [];
  let ids = 0;
  const stream = new MalviAvatarAudioStream(json => messages.push(JSON.parse(json)), () => `utterance-${++ids}`);
  const pcm = Buffer.alloc(19_200, 31).toString('base64');
  stream.append(pcm, false);
  stream.append(pcm, false);
  assert.ok(messages.every(m => m.type === 'agent.speak'));
  stream.append(pcm, true);
  assert.equal(messages.filter(m => m.type === 'agent.speak_end').length, 1);
  assert.ok(messages.every(m => m.event_id === 'utterance-1'));
  assert.deepEqual(Buffer.concat(messages.filter(m => m.audio).map(m => Buffer.from(m.audio, 'base64'))),
    Buffer.concat(Array.from({ length: 3 }, () => Buffer.from(pcm, 'base64'))));
  stream.append(pcm, true);
  assert.equal(messages.at(-1).event_id, 'utterance-2');
});

test('chunking preserves every sample and matches PCM time rather than base64 character count', () => {
  const commands: any[] = [];
  const pcm = Buffer.alloc(48_000 * 3 + 100, 127);
  const stream = new MalviAvatarAudioStream(json => commands.push(JSON.parse(json)), () => 'test');
  stream.append(pcm.toString('base64'));
  const chunks = commands.filter(m => m.audio).map(m => Buffer.from(m.audio, 'base64'));
  assert.equal(chunks[0].length, 19_200);
  assert.equal(chunks[1].length, 48_000);
  assert.ok(chunks.every(c => c.length % 2 === 0));
  assert.deepEqual(Buffer.concat(chunks), pcm);
});

test('interrupt starts a new utterance; invalid data never reaches the transport', () => {
  const commands: any[] = [];
  let id = 0;
  const stream = new MalviAvatarAudioStream(json => commands.push(JSON.parse(json)), () => `${++id}`);
  assert.throws(() => stream.append('not pcm!'));
  assert.throws(() => stream.append('AAAA'));
  stream.append('AAA=', false);
  stream.cancel();
  stream.append('AAA=', true);
  assert.equal(commands[0].event_id, '1');
  assert.equal(commands[1].event_id, '2');
});

test('delivery forwards end-of-reply and preserves voice-only playback', () => {
  const audio = { pcm24k: 'AAAA', sampleRate: 24_000, format: 'pcm_s16le', channels: 1, ended: false };
  let appended: unknown, repeated = 0;
  deliverMalviAudio({ repeatAudio: () => repeated++, appendAudio: (pcm, ended) => { appended = { pcm, ended }; } }, audio);
  assert.deepEqual(appended, { pcm: 'AAAA', ended: false });
  assert.equal(repeated, 0);
  deliverMalviAudio({ repeatAudio: () => repeated++ }, audio);
  assert.equal(repeated, 1);
});
