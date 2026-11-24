import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserMicCapture } from '../src/lib/nanivioMic/BrowserMicCapture';

test('activation unlocks one audio context before connection, but opens no microphone until start', async () => {
  const originalContext = globalThis.AudioContext;
  const originalWorklet = globalThis.AudioWorkletNode;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let gesture = true, contexts = 0, resumes = 0, closes = 0, microphones = 0, tracksStopped = 0;
  const track = { readyState: 'live', getSettings: () => ({ echoCancellation: true }), stop() { tracksStopped++; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  class Context {
    state = 'suspended'; destination = {};
    constructor() { contexts++; }
    get audioWorklet() { return { addModule: async () => {} }; }
    async resume() {
      resumes++;
      if (!gesture) throw new Error('No user activation');
      this.state = 'running';
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    async close() { closes++; this.state = 'closed'; }
  }
  globalThis.AudioContext = Context as any;
  globalThis.AudioWorkletNode = class {
    port = { onmessage: null }; connect() {} disconnect() {}
  } as any;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    mediaDevices: { async getUserMedia() { microphones++; return stream; } },
  } });
  const capture = new BrowserMicCapture();
  try {
    await capture.prepare();
    assert.equal(microphones, 0, 'No acquisition while session/brain/avatar are connecting');
    gesture = false;
    await capture.start(() => {}, error => { throw new Error(error); }, new AbortController().signal);
    assert.equal(contexts, 1);
    assert.equal(resumes, 1, 'Reuse the gesture-unlocked context after network awaits');
    assert.equal(microphones, 1);
    capture.stop(); capture.stop();
    assert.equal(closes, 1);
    assert.equal(tracksStopped, 1);
  } finally {
    capture.stop();
    globalThis.AudioContext = originalContext;
    globalThis.AudioWorkletNode = originalWorklet;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('cancelling prepared microphone audio closes it without requesting permission', async () => {
  const originalContext = globalThis.AudioContext;
  let closes = 0;
  globalThis.AudioContext = class {
    async resume() {}
    state = 'running';
    async close() { closes++; }
  } as any;
  const capture = new BrowserMicCapture();
  try {
    await capture.prepare();
    capture.stop();
    await capture.start(() => { throw Error('late frame'); }, () => {}, new AbortController().signal);
    assert.equal(closes, 1);
  } finally { capture.stop(); globalThis.AudioContext = originalContext; }
});
