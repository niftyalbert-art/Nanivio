import assert from 'node:assert/strict';
import test from 'node:test';
import { createNanivioMicGateway } from '../src/server/assistant/nanivioMicGateway.ts';

const sessionId = '11111111-1111-4111-8111-111111111111';
const streamId = '22222222-2222-4222-8222-222222222222';
const start = { sessionId, streamId, version: 1, sampleRate: 16000, frameSamples: 3200, format: 'pcm_s16le', channels: 1 };
const frame = (sequence: number) => ({ sessionId, streamId, sequence, audio: Buffer.alloc(6400, 12).toString('base64') });
function fixture() {
  const events: any[] = [], delivered: string[] = [];
  const socket: any = { readyState: 1, send: (value: string) => events.push(JSON.parse(value).payload) };
  let ended = 0;
  const brain = {
    inputReadiness: (_: any, owner: string, _id: string) => owner === 'owner' ? { provider: 'gemini', language: 'fr' } : null,
    async audio(_: any, owner: string, id: string, data: unknown, current = () => true) {
      if (!current()) return false;
      assert.equal(owner, 'owner'); assert.equal(id, sessionId);
      delivered.push(data as string); return true;
    },
    endAudio() { ended++; },
  };
  return { gateway: createNanivioMicGateway(brain), socket, events, delivered, brain, ended: () => ended };
}

test('cloud gateway authenticates the existing brain session and validates native/web audio negotiation', () => {
  const f = fixture();
  f.gateway.start(f.socket, 'owner', { ...start, sampleRate: 48000 });
  assert.equal(f.events.at(-1).code, 'PROTOCOL_INVALID');
  f.gateway.start(f.socket, 'intruder', start);
  assert.equal(f.events.at(-1).code, 'SESSION_NOT_READY');
  f.gateway.start(f.socket, 'owner', start);
  assert.equal(f.events.at(-1).state, 'ready');
  assert.equal(f.events.at(-1).provider, 'gemini');
  assert.equal(f.events.at(-1).language, 'fr');
  f.gateway.closeSocket(f.socket);
});

test('gateway receipts indicate actual provider submission, never recognition of the words', async () => {
  const f = fixture();
  f.gateway.start(f.socket, 'owner', start);
  await f.gateway.audio(f.socket, 'owner', frame(1));
  assert.equal(f.delivered.length, 1);
  assert.deepEqual(f.events.at(-1), { sessionId, streamId, version: 1, state: 'receiving', lastSequence: 1, receivedFrames: 1 });
  const other: any = { readyState: 1, send: () => {} };
  await f.gateway.audio(other, 'owner', frame(2));
  await f.gateway.audio(f.socket, 'intruder', frame(2));
  assert.equal(f.delivered.length, 1, 'A stream belongs to both account and authenticated socket');
  f.gateway.stop(f.socket, 'intruder', start);
  assert.equal(f.ended(), 0);
  f.gateway.stop(f.socket, 'owner', start);
  await f.gateway.audio(f.socket, 'owner', frame(2));
  assert.equal(f.delivered.length, 1);
  assert.equal(f.ended(), 1);
});

test('one socket cannot accumulate captures and expired sessions release their slot', () => {
  const f = fixture();
  const nextSession = '33333333-3333-4333-8333-333333333333';
  f.gateway.start(f.socket, 'owner', start);
  f.gateway.start(f.socket, 'owner', { ...start, sessionId: nextSession });
  assert.equal(f.events.at(-1).code, 'MIC_ALREADY_ACTIVE');
  f.brain.inputReadiness = (_, owner, id) => owner === 'owner' && id === nextSession ? { provider: 'gemini', language: 'fr' } : null;
  f.gateway.start(f.socket, 'owner', { ...start, sessionId: nextSession });
  assert.equal(f.events.at(-1).state, 'ready');
  assert.equal(f.events.at(-1).sessionId, nextSession);
  assert.equal(f.ended(), 1);
  f.gateway.closeSocket(f.socket);
});

test('duplicate or oversized frames terminate the owned stream rather than replaying speech', async () => {
  for (const invalid of [{ ...frame(1), sequence: 2 }, { ...frame(1), audio: 'A'.repeat(20000) }]) {
    const f = fixture();
    f.gateway.start(f.socket, 'owner', start);
    await f.gateway.audio(f.socket, 'owner', invalid);
    assert.equal(f.events.at(-1).code, 'FRAME_INVALID');
    assert.equal(f.delivered.length, 0);
    assert.equal(f.ended(), 1);
  }
});

test('stop invalidates in-flight audio and prevents late acknowledgments', async () => {
  const f = fixture();
  let release!: () => void;
  f.brain.audio = async (_: any, _owner: string, _id: string, data: unknown, current = () => true) => {
    await new Promise<void>(resolve => { release = resolve; });
    if (!current()) return false;
    f.delivered.push(data as string); return true;
  };
  f.gateway.start(f.socket, 'owner', start);
  const sending = f.gateway.audio(f.socket, 'owner', frame(1));
  await new Promise(resolve => setImmediate(resolve));
  f.gateway.stop(f.socket, 'owner', start);
  release(); await sending;
  assert.equal(f.delivered.length, 0);
  assert.equal(f.events.filter(e => e.state === 'receiving').length, 0);
});

test('provider input is serialized and queued PCM is bounded', async () => {
  const f = fixture();
  let release!: () => void;
  let calls = 0;
  f.brain.audio = async (_: any, _owner: string, _id: string, data: unknown, current = () => true) => {
    calls++;
    if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
    if (!current()) return false;
    f.delivered.push(data as string); return true;
  };
  f.gateway.start(f.socket, 'owner', start);
  const pending = [1, 2, 3].map(sequence => f.gateway.audio(f.socket, 'owner', frame(sequence)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1, 'Concurrent Redis/provider waits cannot reorder microphone frames');
  await f.gateway.audio(f.socket, 'owner', frame(4));
  assert.equal(f.events.at(-1).code, 'INPUT_BUSY');
  release(); await Promise.all(pending);
  assert.equal(f.delivered.length, 0);
});
