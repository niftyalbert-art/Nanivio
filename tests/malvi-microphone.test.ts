import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeMalviMicrophoneFrame } from '../src/lib/malviMicrophone.ts';
import { realtimeClient } from '../src/lib/realtimeClient.ts';

test('microphone thread transfers retain the exact PCM16 little-endian speech bytes', () => {
  const pcm = new ArrayBuffer(6400);
  const view = new DataView(pcm);
  view.setInt16(0, -32768, true);
  view.setInt16(2, 12345, true);
  view.setInt16(4, 32767, true);
  const encoded = encodeMalviMicrophoneFrame(pcm);
  assert.deepEqual(Buffer.from(encoded, 'base64'), Buffer.from(pcm));
  assert.equal(encoded.length, 8536);
  assert.equal(encodeMalviMicrophoneFrame(encoded), encoded, 'Accept bounded legacy frames during rollout');
});

test('invalid or oversized microphone messages cannot become outbound audio', () => {
  for (const value of [undefined, null, {}, [], '', new ArrayBuffer(0), new ArrayBuffer(2),
    new ArrayBuffer(6402), 'A'.repeat(100_000), '!'.repeat(8536), 'A'.repeat(8536)]) {
    assert.throws(() => encodeMalviMicrophoneFrame(value), /invalid audio frame/);
  }
});

test('live microphone audio is sent immediately or rejected, never queued for reconnect', () => {
  const state = realtimeClient as unknown as {
    socket: { readyState: number; send: (value: string) => void } | null;
    connect: () => void;
  };
  const originalSocket = state.socket;
  const originalConnect = state.connect;
  const sent: string[] = [];
  try {
    state.connect = () => { throw new Error('Do not reconnect or queue a live microphone frame'); };
    state.socket = { readyState: WebSocket.CLOSED, send: value => sent.push(value) };
    assert.equal(realtimeClient.send('malvi:brain_audio', { sessionId: 'fixture', audio: 'fixture' }), false);
    assert.equal(sent.length, 0);
    state.socket = { readyState: WebSocket.OPEN, send: value => sent.push(value) };
    assert.equal(realtimeClient.send('malvi:brain_audio', { sessionId: 'fixture', audio: 'fixture' }), true);
    assert.deepEqual(JSON.parse(sent[0]), { type: 'malvi:brain_audio', payload: { sessionId: 'fixture', audio: 'fixture' } });
  } finally {
    state.socket = originalSocket;
    state.connect = originalConnect;
  }
});
