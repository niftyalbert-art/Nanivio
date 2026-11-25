import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLiveCapture, hasLiveMedia, shouldReloadForStaleChunk, trackMediaCapture } from '../src/lib/staleChunkReload.ts';

test('a stale code-split chunk reloads the page once per minute at most', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(shouldReloadForStaleChunk(storage, 1_000_000), true);
  assert.equal(shouldReloadForStaleChunk(storage, 1_030_000), false);
  assert.equal(shouldReloadForStaleChunk(storage, 1_061_000), true);
});

test('a page with live call media is never reloaded', () => {
  class FakeStream { constructor(private live: boolean) {} getTracks() { return [{ readyState: this.live ? 'live' : 'ended' }]; } }
  (globalThis as any).MediaStream = FakeStream;
  const doc = (live: boolean) => ({ querySelectorAll: () => [{ srcObject: new FakeStream(live) }] }) as unknown as Document;
  assert.equal(hasLiveMedia(doc(true)), true);
  assert.equal(hasLiveMedia(doc(false)), false);
  assert.equal(hasLiveMedia({ querySelectorAll: () => [] } as unknown as Document), false);
});

test('a live microphone or camera capture blocks the reload until it ends', async () => {
  const track = { readyState: 'live', listeners: [] as (() => void)[], addEventListener(_: string, fn: () => void) { this.listeners.push(fn); } };
  const devices = { getUserMedia: async () => ({ getTracks: () => [track] }) } as unknown as MediaDevices;
  trackMediaCapture(devices);
  assert.equal(hasLiveCapture(), false);
  await devices.getUserMedia({ audio: true });
  assert.equal(hasLiveCapture(), true);
  track.readyState = 'ended'; track.listeners.forEach(fn => fn());
  assert.equal(hasLiveCapture(), false);
});
