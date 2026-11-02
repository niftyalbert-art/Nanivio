import test from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceQueue } from '../src/server/assistant/inferenceQueue';
import { BusinessTranslationAudience } from '../src/server/businessTranslationAudience';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('queued paid inference gets priority without interrupting running work or starving normal plans', async () => {
  const queue = createInferenceQueue(1);
  const started: string[] = [], releases: (() => void)[] = [];
  const submit = (tier: string, name: string) => queue.run(tier, () => {
    started.push(name); return new Promise<void>(resolve => releases.push(resolve));
  });
  const all = [submit('free', 'running'), submit('free', 'normal'), ...[1, 2, 3, 4].map(n => submit('malvi_premium', `priority${n}`))];
  await tick(); assert.deepEqual(started, ['running']);
  for (let n = 0; n < 6; n++) { releases.shift()!(); await tick(); }
  await Promise.all(all);
  assert.deepEqual(started, ['running', 'priority1', 'priority2', 'priority3', 'normal', 'priority4']);
  assert.deepEqual(queue.stats(), { active: 0, pending: 0 });
});
test('priority queue bounds capacity, removes cancelled requests and recovers after task failure', async () => {
  const queue = createInferenceQueue(1, 1, 2000);
  let release!: () => void, generated = 0;
  const running = queue.run('free', () => new Promise<void>(r => { release = r; }));
  const abort = new AbortController();
  const pending = queue.run('malvi_business', async () => { generated++; }, abort.signal);
  const rejected = assert.rejects(pending);
  await assert.rejects(queue.run('free', async () => {}), /busy/);
  abort.abort(); await rejected; await tick(); release(); await running; await tick();
  assert.equal(generated, 0);
  await assert.rejects(queue.run('malvi_business', async () => { throw new Error('fixture provider failure'); }), /fixture/);
  await queue.run('free', async () => { generated++; }); await tick(); assert.equal(generated, 1);
});
test('waiting inference expires without calling provider work', async () => {
  const queue = createInferenceQueue(1, 1, 20);
  let release!: () => void, calls = 0;
  const active = queue.run('free', () => new Promise<void>(r => { release = r; }));
  await assert.rejects(queue.run('malvi_premium', async () => { calls++; }), /busy/);
  release(); await active; assert.equal(calls, 0);
});

const room = 'business:11111111-1111-4111-8111-111111111111';
test('group translated audio only reaches authorized, explicit listeners in the same room', async () => {
  let now = 1000;
  const received: any[] = [], other: any[] = [];
  const audience = new BusinessTranslationAudience(async (user) => {
    if (user === 'stranger') throw new Error('No paid membership or lease');
    return { language: 'en', endsAt: 5000 };
  }, () => 512, () => now);
  const listener = { send: (...p: any[]) => received.push(p) }, second = { send: (...p: any[]) => other.push(p) };
  await assert.rejects(audience.subscribe(listener, 'stranger', room));
  assert.equal(audience.remote(room, 'speaker', 'audio', {}), false);
  await audience.subscribe(listener, 'member', room);
  await audience.subscribe(second, 'member2', room.replace('11111111-', '22222222-'));
  assert.equal(audience.remote(room, 'speaker', 'audio', { speakerRtcUid: 999 }), true);
  assert.equal(received[0][1].speakerRtcUid, 512); assert.equal(other.length, 0);
  assert.equal(audience.remote(room, 'member', 'audio', {}), false, 'do not echo speaker audio');
  audience.closeRoom(room);
  assert.equal(audience.allowed(listener, 'member', room), false, 'owner close revokes audio immediately');
  await audience.subscribe(listener, 'member', room);
  now = 5000;
  assert.equal(audience.allowed(listener, 'member', room), false);
  assert.equal(audience.remote(room, 'speaker', 'audio', {}), false, 'lease expiry must not be extended by listener TTL');
});
test('leaving during asynchronous listener authorization cannot create a ghost listener', async () => {
  let finish!: (language: string) => void;
  const audience = new BusinessTranslationAudience(() => new Promise<string>(r => { finish = r; }), () => 1);
  const peer = { send() {} };
  const start = audience.subscribe(peer, 'member', room);
  audience.remove(peer); finish('en');
  await assert.rejects(start, /cancelled/);
  assert.equal(audience.remote(room, 'other', 'audio', {}), false);
});
