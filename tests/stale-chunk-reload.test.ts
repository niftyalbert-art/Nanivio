import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReloadForStaleChunk } from '../src/lib/staleChunkReload.ts';

test('a stale code-split chunk reloads the page once per minute at most', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(shouldReloadForStaleChunk(storage, 1_000_000), true);
  assert.equal(shouldReloadForStaleChunk(storage, 1_030_000), false);
  assert.equal(shouldReloadForStaleChunk(storage, 1_061_000), true);
});
