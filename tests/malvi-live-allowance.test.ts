import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMalviLiveAllowance, readMalviLiveAllowance } from '../src/server/assistant/liveAllowance.ts';
import { MalviAllowanceClock } from '../src/lib/malviAllowanceClock.ts';

const now = 1_000_000;
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const lease = { mode: 'avatar' as const, settled_at: null, ends_at: at(600), subscription_id: 'paid' };
const subscription = {
  voice_minutes_allowed: 120, voice_minutes_used: 5,
  video_minutes_allowed: 60, video_minutes_used: 10,
  current_period_end: at(3600 * 24),
};

test('includes only the unspent current reservation in a paid balance', () => {
  const snapshot = calculateMalviLiveAllowance(lease, { credit_balance: '50' }, subscription, 'avatar', now + 600_000, now);
  assert.equal(snapshot.remainingSeconds, 3600);
  assert.equal(snapshot.serverNow, now);
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 50 }, subscription,
    'avatar', now + 600_000, now + 90_000).remainingSeconds, 3510);
});

test('a fully reserved three-minute trial is not displayed as exhausted', () => {
  const trial = { ...lease, ends_at: at(180) };
  const plan = { ...subscription, video_minutes_allowed: 3, video_minutes_used: 3 };
  assert.equal(calculateMalviLiveAllowance(trial, { credit_balance: 0 }, plan, 'avatar', now + 180_000, now).remainingSeconds, 180);
  assert.equal(calculateMalviLiveAllowance(trial, { credit_balance: 0 }, plan, 'avatar', now + 180_000, now + 120_000).remainingSeconds, 60);
  assert.equal(calculateMalviLiveAllowance(trial, { credit_balance: 0 }, plan, 'avatar', now + 180_000, now + 150_000).remainingSeconds, 30);
  assert.equal(calculateMalviLiveAllowance(trial, { credit_balance: 0 }, plan, 'avatar', now + 180_000, now + 180_000).remainingSeconds, 0);
});

test('uses the smaller actual credit and mode balances, not other plan benefits', () => {
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 2 }, subscription,
    'avatar', now + 600_000, now).remainingSeconds, 720);
  const capped = { ...subscription, video_minutes_used: 59 };
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 50 }, capped,
    'avatar', now + 600_000, now).remainingSeconds, 660);
  const voice = { ...lease, mode: 'voice' as const };
  assert.equal(calculateMalviLiveAllowance(voice, { credit_balance: 200 }, subscription,
    'voice', now + 600_000, now).remainingSeconds, 7500);
});

test('period expiry and the actual hard deadline limit reserved time', () => {
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 50 },
    { ...subscription, current_period_end: at(90) }, 'avatar', now + 600_000, now).remainingSeconds, 90);
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 0 }, subscription,
    'avatar', now + 120_000, now).remainingSeconds, 120);
  assert.equal(calculateMalviLiveAllowance(lease, { credit_balance: 50 },
    { ...subscription, current_period_end: at(-1) }, 'avatar', now + 600_000, now).remainingSeconds, 0);
});

test('invalid, settled and wrong-mode snapshots are unavailable, never fake zero', () => {
  for (const balance of [null, undefined, '', -1, NaN, Infinity]) {
    assert.throws(() => calculateMalviLiveAllowance(lease, { credit_balance: balance as any },
      subscription, 'avatar', now + 600_000, now), { code: 'MALVI_USAGE_UNAVAILABLE' });
  }
  assert.throws(() => calculateMalviLiveAllowance({ ...lease, settled_at: at(1) }, { credit_balance: 1 },
    subscription, 'avatar', now + 600_000, now), { code: 'MALVI_USAGE_UNAVAILABLE' });
  assert.throws(() => calculateMalviLiveAllowance(lease, { credit_balance: 1 },
    subscription, 'voice', now + 600_000, now), { code: 'MALVI_USAGE_UNAVAILABLE' });
});

function databaseFixture(missingTable?: string) {
  const calls: { table: string; filters: Record<string, string> }[] = [];
  const rows: Record<string, unknown> = {
    nanivio_malvi_live_leases: lease, malvi_credit_accounts: { credit_balance: 50 },
    nanivio_malvi_subscriptions: subscription,
  };
  return {
    calls,
    database: { from(table: string) {
      const filters: Record<string, string> = {};
      calls.push({ table, filters });
      const query = {
        select() { return query; },
        eq(key: string, value: string) { filters[key] = value; return query; },
        abortSignal() { return query; },
        async maybeSingle() { return { data: table === missingTable ? null : rows[table], error: null }; },
      };
      return query;
    } } as any,
  };
}

test('all read-only queries are account-scoped and the lease and subscription must match', async () => {
  const fixture = databaseFixture();
  const data = await readMalviLiveAllowance('owner', 'current-lease', 'avatar', now + 600_000,
    { database: fixture.database, now: () => now });
  assert.equal(data.remainingSeconds, 3600);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.every(call => call.filters.user_id === 'owner'));
  assert.equal(fixture.calls.find(call => call.table === 'nanivio_malvi_live_leases')?.filters.lease_id, 'current-lease');
  assert.equal(fixture.calls.find(call => call.table === 'nanivio_malvi_subscriptions')?.filters.subscription_id, 'paid');
});

test('missing billing rows are reported as unavailable', async () => {
  for (const table of ['malvi_credit_accounts', 'nanivio_malvi_live_leases', 'nanivio_malvi_subscriptions']) {
    await assert.rejects(readMalviLiveAllowance('owner', 'lease', 'avatar', now + 600_000,
      { database: databaseFixture(table).database, now: () => now }), { code: 'MALVI_USAGE_UNAVAILABLE' });
  }
});

test('the display clock counts down independently of idle renewals and device wall time', () => {
  let elapsed = 0;
  const clock = new MalviAllowanceClock(() => elapsed);
  assert.equal(clock.secondsRemaining(), null);
  assert.equal(clock.update({ remainingSeconds: 180, serverNow: now }), true);
  elapsed = 120_000;
  assert.equal(clock.secondsRemaining(), 60);
  assert.equal(clock.update({ remainingSeconds: 180, serverNow: now }), false);
  assert.equal(clock.update({ remainingSeconds: 999, serverNow: now - 1 }), false);
  assert.equal(clock.secondsRemaining(), 60);
  elapsed = 150_000;
  assert.equal(clock.secondsRemaining(), 30);
  elapsed = 190_000;
  assert.equal(clock.secondsRemaining(), 0);
  clock.reset();
  assert.equal(clock.secondsRemaining(), null, 'closing or changing account removes the previous balance');
});

test('a later real purchase can update the display but malformed balances cannot', () => {
  let elapsed = 0;
  const clock = new MalviAllowanceClock(() => elapsed);
  clock.update({ remainingSeconds: 30, serverNow: now });
  elapsed = 10_000;
  assert.equal(clock.update({ remainingSeconds: 300, serverNow: now + 10_000 }), true);
  assert.equal(clock.secondsRemaining(), 300);
  for (const remainingSeconds of [-1, NaN, Infinity, 2.5, null]) {
    assert.equal(clock.update({ remainingSeconds: remainingSeconds as any, serverNow: now + 20_000 }), false);
  }
  assert.equal(clock.secondsRemaining(), 300);
});
