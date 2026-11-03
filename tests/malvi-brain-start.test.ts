import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMalviBrainStart } from '../src/lib/malviBrainStart';

const payload = { sessionId: 'owned-session', language: 'fr' };
function clock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => { time += ms; } };
}
test('a connection taking longer than the old 500ms retry still starts the brain exactly once', async () => {
  const timing = clock();
  let sent = 0;
  const started = await sendMalviBrainStart((type, message) => {
    assert.equal(type, 'malvi:brain_start'); assert.equal(message, payload);
    if (timing.now() < 1800) return false;
    sent++; return true;
  }, payload, () => true, timing);
  assert.equal(started, true); assert.equal(sent, 1); assert.equal(timing.now(), 1800);
});
test('immediately connected transport sends without adding startup latency', async () => {
  let waits = 0;
  assert.equal(await sendMalviBrainStart(() => true, payload, () => true,
    { sleep: async () => { waits++; } }), true);
  assert.equal(waits, 0);
});
test('closing or replacing the session cancels retries before a late connection can start it', async () => {
  let current = true, attempts = 0;
  const started = await sendMalviBrainStart(() => { attempts++; return false; }, payload,
    () => current, { sleep: async () => { current = false; } });
  assert.equal(started, false); assert.equal(attempts, 1);
});
test('a permanently closed connection fails within its bound, rather than leaving a silent avatar', async () => {
  const timing = clock(); let attempts = 0;
  await assert.rejects(sendMalviBrainStart(() => { attempts++; return false; }, payload,
    () => true, { ...timing, timeoutMs: 500 }), /conversation connection could not open/);
  assert.equal(timing.now(), 500); assert.equal(attempts, 5);
});
test('an obsolete session never sends a brain-start command', async () => {
  assert.equal(await sendMalviBrainStart(() => assert.fail('Obsolete session'), payload, () => false), false);
});
