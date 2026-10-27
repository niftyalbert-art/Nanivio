import assert from 'node:assert/strict';
import test from 'node:test';
import { MalviSessionClock } from '../src/lib/malviSessionClock.ts';

test('server-relative countdown ignores phone wall-clock skew and subsequent clock changes', () => {
  let monotonic = 100;
  const clock = new MalviSessionClock(() => monotonic);
  const oldDateNow = Date.now;
  try {
    Date.now = () => 99999999999999;
    clock.update({ serverNow: 1000, idleDeadline: 61000, hardDeadline: 601000 });
    assert.equal(clock.secondsRemaining(), 60);
    monotonic += 15000;
    Date.now = () => 0;
    assert.equal(clock.secondsRemaining(), 45);
    monotonic += 45000;
    assert.equal(clock.secondsRemaining(), 0);
  } finally { Date.now = oldDateNow; }
});

test('renewals are ordered, duplicates cannot keep a session alive and hard limit is fixed', () => {
  let now = 0;
  const clock = new MalviSessionClock(() => now);
  clock.update({ serverNow: 1000, idleDeadline: 61000, hardDeadline: 121000 });
  now = 20000;
  clock.update({ serverNow: 21000, idleDeadline: 81000, hardDeadline: 121000 });
  assert.equal(clock.secondsRemaining(), 60);
  now = 30000;
  clock.update({ serverNow: 11000, idleDeadline: 71000 });
  assert.equal(clock.secondsRemaining(), 50);
  clock.update({ serverNow: 21000, idleDeadline: 81000 });
  assert.equal(clock.secondsRemaining(), 50);
  clock.update({ serverNow: 41000, idleDeadline: 81000, hardDeadline: 121000 });
  assert.equal(clock.secondsRemaining(), 40, 'resume read shortens a clock that paused while backgrounded');
  clock.update({ serverNow: 31000, idleDeadline: 500000, hardDeadline: 999999 });
  assert.equal(clock.secondsRemaining(), 80);
  now = 120000;
  assert.equal(clock.secondsRemaining(), 0);
  clock.reset();
  assert.equal(clock.secondsRemaining(), null);
  assert.equal(clock.update({ idleDeadline: 60000 }), false);
  assert.equal(clock.secondsRemaining(), null);
});
