import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimeMediaLane } from '../src/server/realtimeMediaLane';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: (allowed: boolean) => void;
  const promise = new Promise<boolean>(done => { resolve = done; });
  return { promise, resolve };
}

test('live media advances independently of an unresolved control operation and remains ordered', async () => {
  const slowControl = deferred(), media = new RealtimeMediaLane(), sent: number[] = [];
  let controlDone = false;
  void slowControl.promise.then(() => { controlDone = true; });
  for (let i = 0; i < 4; i++) media.enqueue(async () => true, () => sent.push(i), assert.fail);
  await tick();
  assert.deepEqual(sent, [0, 1, 2, 3]);
  assert.equal(controlDone, false);
  slowControl.resolve(true);
});

test('authentication denial and cancellation during a registry lookup cannot deliver queued speech', async () => {
  const media = new RealtimeMediaLane(), permission = deferred();
  let sent = 0;
  media.enqueue(() => permission.promise, () => sent++, assert.fail);
  await tick();
  media.clear();
  permission.resolve(true);
  await tick();
  assert.equal(sent, 0);
  media.enqueue(async () => false, () => sent++, assert.fail);
  await tick();
  assert.equal(sent, 0);
});

test('a new stream does not wait for an abandoned streams authentication lookup', async () => {
  const media = new RealtimeMediaLane(), old = deferred(), sent: string[] = [];
  media.enqueue(() => old.promise, () => sent.push('old'), assert.fail);
  await tick();
  media.clear();
  media.enqueue(async () => true, () => sent.push('new'), assert.fail);
  await tick();
  assert.deepEqual(sent, ['new']);
  old.resolve(true);
  await tick();
  assert.deepEqual(sent, ['new']);
});

test('overflow stops explicitly once rather than growing a queue or silently dropping words', async () => {
  const media = new RealtimeMediaLane(2), permission = deferred();
  let failures = 0, delivered = 0;
  for (let i = 0; i < 10; i++)
    media.enqueue(() => permission.promise, () => delivered++, () => failures++);
  permission.resolve(true);
  await tick();
  assert.equal(failures, 1);
  assert.equal(delivered, 0);
  media.clear();
  media.enqueue(async () => true, () => delivered++, () => failures++);
  await tick();
  assert.equal(delivered, 1);
});

test('slow permission checks cannot release stale audio into the next conversation', async () => {
  const media = new RealtimeMediaLane(6, 5), permission = deferred();
  let failures = 0, delivered = 0;
  media.enqueue(() => permission.promise, () => delivered++, () => failures++);
  await tick();
  await new Promise(resolve => setTimeout(resolve, 15));
  permission.resolve(true);
  await tick();
  assert.equal(failures, 1);
  assert.equal(delivered, 0);
});

test('an unexpected registry failure stops the media lane without an unhandled rejection', async () => {
  const media = new RealtimeMediaLane();
  let failures = 0;
  media.enqueue(async () => { throw new Error('store unavailable'); }, assert.fail, () => failures++);
  await tick();
  assert.equal(failures, 1);
});
