import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { waitForCallAnswerConfirmation } from '../src/lib/callAnswerConfirmation';
import { finishAnsweredCall } from '../src/lib/callMediaErrors';

function fixture() {
  const listeners = new Map<string, Set<(payload: any) => void>>();
  const source = {
    on(type: string, fn: (payload: any) => void) {
      const group = listeners.get(type) || new Set(); group.add(fn); listeners.set(type, group);
      return () => { group.delete(fn); };
    },
    emit(type: string, payload: any) { for (const fn of listeners.get(type) || []) fn(payload); },
  };
  const controller = new AbortController();
  const expected = { callId: 'owned-call', channelName: 'owned-room', callType: 'audio' as const,
    signal: controller.signal };
  const count = () => [...listeners.values()].reduce((sum, group) => sum + group.size, 0);
  return { source, controller, expected, count };
}

test('answering cannot open media or start billing before server confirmation', async () => {
  const f = fixture(), events: string[] = [];
  const confirmation = waitForCallAnswerConfirmation(f.source, f.expected);
  const finished = finishAnsweredCall(async () => {
    await confirmation; events.push('media'); return true;
  }, async () => { events.push('billing'); }, () => assert.fail('Unexpected billing error'));
  await Promise.resolve();
  assert.deepEqual(events, []);
  f.source.emit('call:connected', f.expected);
  await finished;
  assert.deepEqual(events, ['media', 'billing']);
  assert.equal(f.count(), 0);
});

test('wrong call, channel or media type cannot release the confirmation gate', async () => {
  const f = fixture(); let ready = false;
  const confirmed = waitForCallAnswerConfirmation(f.source, f.expected).then(() => { ready = true; });
  for (const change of [{ callId: 'other-call' }, { channelName: 'other-room' }, { callType: 'video' }]) {
    f.source.emit('call:connected', { ...f.expected, ...change });
    await Promise.resolve(); assert.equal(ready, false);
  }
  f.source.emit('call:connected', f.expected); await confirmed;
  assert.equal(ready, true);
});

test('call end rejects pending admission and late confirmation cannot restart it', async () => {
  const f = fixture();
  const rejected = assert.rejects(waitForCallAnswerConfirmation(f.source, f.expected), { name: 'AbortError' });
  f.source.emit('call:ended', { callId: f.expected.callId }); await rejected;
  assert.equal(f.count(), 0);
  f.source.emit('call:connected', f.expected); assert.equal(f.count(), 0);
});

test('an unrelated call ending cannot cancel the pending answer', async () => {
  const f = fixture(), confirmed = waitForCallAnswerConfirmation(f.source, f.expected);
  f.source.emit('call:ended', { callId: 'other-call' });
  assert.equal(f.count(), 3);
  f.source.emit('call:connected', f.expected); await confirmed;
});

test('local hangup and account cleanup cancel the pending answer', async () => {
  const f = fixture();
  const rejected = assert.rejects(waitForCallAnswerConfirmation(f.source, f.expected), { name: 'AbortError' });
  f.controller.abort(); await rejected; assert.equal(f.count(), 0);
});

test('already-cancelled answers do not subscribe to confirmation', async () => {
  const f = fixture(); f.controller.abort();
  await assert.rejects(waitForCallAnswerConfirmation(f.source, f.expected), { name: 'AbortError' });
  assert.equal(f.count(), 0);
});

test('missing server confirmation expires and removes every listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const rejected = assert.rejects(waitForCallAnswerConfirmation(f.source, f.expected), { name: 'TimeoutError' });
  t.mock.timers.tick(20001); await rejected; assert.equal(f.count(), 0);
});

test('cancelled admission cannot start media or billing', async () => {
  const f = fixture(); let started = false;
  const confirmation = waitForCallAnswerConfirmation(f.source, f.expected);
  const finished = finishAnsweredCall(async () => { await confirmation; started = true; },
    async () => assert.fail('Cancelled calls must not bill'), () => assert.fail('Not a billing error'));
  f.controller.abort(); await finished; assert.equal(started, false);
});

test('the answer UI registers confirmation before sending accept and rejects stale notification IDs', () => {
  const code = fs.readFileSync('src/context/NanivioContext.tsx', 'utf8');
  const start = code.indexOf('const acceptIncomingCall =');
  const block = code.slice(start, code.indexOf('const declineIncomingCall =', start));
  assert.match(block, /callId && callId !== incomingCall.callId/);
  assert.ok(block.indexOf('waitForCallAnswerConfirmation(') < block.indexOf('realtimeClient.acceptCall('));
  assert.ok(block.indexOf('await confirmation') < block.indexOf('return connectCallMedia('));
});
