import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveAvatarService } from '../src/server/assistant/liveAvatarService';

test('shared Business avatar uses its authorized conference escrow, not a second minute reservation', async () => {
  const rows = new Map<string, any>(); let reservations = 0, ended = 0, allowed = true, touches = 0;
  const service = createLiveAvatarService({
    now: () => 1000, uuid: () => 'fixture-business-avatar',
    store: async () => ({
      async reserve() {}, async save(record: any) { rows.set(record.id, structuredClone(record)); },
      async get(id: string) { return rows.get(id) || null; }, async release(record: any) { rows.delete(record.id); },
      async claimStop(id: string) { return rows.get(id) || null; },
      async touch(id: string) { touches++; return rows.get(id); },
    } as any),
    provider: async (path) => {
      if (path.endsWith('/token')) return { session_id: 'fake-provider-id', session_token: 'fake-token' };
      if (path.endsWith('/stop')) ended++;
      return {};
    },
    usage: { async reserve() { reservations++; return 60; }, async finish() { throw new Error('Must not refund or settle the host conference here'); } } as any,
    businessAccess: async () => { if (!allowed) throw new Error('Meeting closed or escrow ended'); },
  });
  const context = { roomId: 'fixture-room', leaseId: 'fixture-conference-escrow', endsAt: 31000 };
  const created = await service.create('fixture-owner', 'en', 'LITE', 'medium', 'gemini', context);
  assert.equal(created.hardDeadline, context.endsAt);
  assert.equal(reservations, 0);
  await service.activity('fixture-owner', created.id); assert.equal(touches, 1);
  allowed = false;
  await assert.rejects(service.owned('fixture-owner', created.id), /Meeting closed/);
  await assert.rejects(service.activity('fixture-owner', created.id), /Meeting closed/);
  assert.equal(touches, 1, 'revoked meetings must not touch the idle deadline');
  await service.stop('fixture-owner', created.id);
  assert.equal(ended, 1); assert.equal(rows.size, 0);
});
test('unverified external conference context cannot bypass ordinary avatar billing', async () => {
  let charged = false;
  const service = createLiveAvatarService({
    now: () => 1000, uuid: () => 'fake',
    store: async () => { throw new Error('Must reject before opening storage'); },
    provider: async () => { charged = true; return {}; },
  });
  await assert.rejects(service.create('owner', 'en', 'LITE', 'medium', 'gemini',
    { roomId: 'arbitrary', leaseId: 'not-verified', endsAt: 5000 }), /authorized/);
  assert.equal(charged, false);
});
