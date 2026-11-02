import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { createBusinessService, createBusinessRouter, applyBusinessCommand, type BusinessRepository, type RoomRow } from '../src/server/assistant/businessRooms';
import { planAllows } from '../src/server/assistant/planAccess';
import { validateMeetingAudio, pcmWave } from '../src/server/assistant/businessMedia';
import { subscriptionHasCapability } from '../src/lib/malviCapabilities';
import { AssistantError } from '../src/server/assistant/redisStore';
import { initialMalviCatalog, validateMalviPlans } from '../src/lib/malviPlanCatalog';
import { billingDb } from '../src/server/billingDb';

function fixture() {
  const rows = new Map<string, RoomRow>();
  let conflicts = 0, modelCalls = 0, claimCalls = 0;
  const repository: BusinessRepository = {
    async list(user) { return [...rows.values()].filter(r => r.member_ids.includes(user)).map(r => structuredClone(r)); },
    async read(id) { return rows.has(id) ? structuredClone(rows.get(id)!) : null; },
    async insert(row) { rows.set(row.id, structuredClone(row)); },
    async replace(old, next) {
      if (conflicts > 0) { conflicts--; return false; }
      if (rows.get(old.id)?.version !== old.version) return false;
      rows.set(old.id, structuredClone(next)); return true;
    },
    async invitation(hash) { return structuredClone([...rows.values()].find(r => r.invite_hash === hash) || null); },
  };
  const authorize = async (user: string): Promise<any> => {
    if (!['alice', 'bob', 'charlie'].includes(user)) throw new AssistantError(403, 'MALVI_FEATURE_NOT_INCLUDED', 'Business access required.');
  };
  const service = createBusinessService(() => repository, authorize, async (room, operation) => {
    modelCalls++;
    return { content: `${operation}: ${room.messages[0].text}; knowledge: ${room.knowledge.map(k => k.title).join(',')}`,
      actions: [{ task: 'Follow up on the supplied decision', ownerId: 'alice' }] };
  }, async () => { claimCalls++; });
  return { rows, repository, service, stats: () => ({ modelCalls, claimCalls }), conflict: (n: number) => { conflicts = n; } };
}
test('tier capabilities distinguish trial, voice, basic, premium and Business', () => {
  for (const tier of ['free', 'malvi_voice', 'malvi_basic']) {
    assert.equal(planAllows(tier, 'voice'), true);
    assert.equal(planAllows(tier, 'business'), false);
    assert.equal(planAllows(tier, 'memory'), false);
  }
  assert.equal(planAllows('malvi_voice', 'avatar'), false);
  assert.equal(planAllows('malvi_premium', 'research'), true);
  assert.equal(planAllows('malvi_premium', 'multimodal'), true);
  assert.equal(planAllows('malvi_business', 'business'), true);
  assert.equal(planAllows('__proto__', 'business'), false);
  assert.equal(subscriptionHasCapability({ tier: 'malvi_premium', status: 'ACTIVE', purchasedCapabilities: ['voice'] }, 'memory'), false);
  assert.equal(subscriptionHasCapability({ tier: 'malvi_basic', status: 'ACTIVE', purchasedCapabilities: ['voice', 'research'] }, 'research'), true);
  assert.equal(subscriptionHasCapability({ tier: 'malvi_business', status: 'ACTIVE', currentPeriodEnd: 0 }, 'business'), false);
});
test('catalogue capability flags are structured, validated and separate from feature copy', () => {
  const plans = initialMalviCatalog(billingDb.malviPlans).plans;
  assert.equal(validateMalviPlans(plans).length, 5);
  const altered = structuredClone(plans);
  altered[2].capabilities!.push('business');
  assert.throws(() => validateMalviPlans(altered), /must agree/);
  const spoofed = structuredClone(plans);
  spoofed[0].capabilities = ['admin' as any];
  assert.throws(() => validateMalviPlans(spoofed), /known/);
});
test('owner-controlled meeting language and co-pilot consent cannot be changed by another member', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Meeting', 'Decide together');
  const invitation = await f.service.invite('alice', room.id);
  await f.service.join('bob', 'Bob', invitation.code);
  await assert.rejects(f.service.command('bob', room.id, { type: 'copilot', enabled: true }), /owner/);
  await assert.rejects(f.service.command('alice', room.id, { type: 'meetingLanguage', language: 'unsupported' }), /supported/);
  const selected = await f.service.command('alice', room.id, { type: 'meetingLanguage', language: 'fr' });
  assert.equal(selected.meetingLanguage, 'fr');
  await f.service.command('alice', room.id, { type: 'meeting', open: true });
  await assert.rejects(f.service.command('alice', room.id, { type: 'meetingLanguage', language: 'en' }), /Close/);
});
test('automatic co-pilot only answers new addressed, consented transcripts in an enabled live meeting', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Meeting', 'Decide together');
  const source = randomUUID();
  await f.service.command('alice', room.id, { type: 'message', id: source, kind: 'transcript', text: 'Malvi, explain our next step.' });
  await assert.rejects(f.service.assist('alice', room.id, 'analysis', source), /consented/);
  await f.service.command('alice', room.id, { type: 'meeting', open: true });
  await f.service.command('alice', room.id, { type: 'copilot', enabled: true });
  const answer = await f.service.assist('alice', room.id, 'analysis', source);
  assert.equal(answer.copilotThrough, source);
  assert.equal(answer.copilotPending, null);
  assert.equal(answer.messages.filter(m => m.kind === 'assistant').length, 1);
  await assert.rejects(f.service.assist('alice', room.id, 'analysis', source), /consented/);
  assert.equal(f.stats().modelCalls, 1);
});
test('shared room creation persists identity and rejects non-entitled callers', async () => {
  const f = fixture();
  const room = await f.service.create('alice', 'Alice', 'Project', 'Decide next steps');
  assert.equal((await f.service.list('alice'))[0].id, room.id);
  assert.deepEqual(await f.service.list('bob'), []);
  await assert.rejects(f.service.owned('bob', room.id), /not found/);
  await assert.rejects(f.service.create('outsider', 'Mallory', 'T', 'O'), /Business access/);
});
test('invitations are owner-only, hashed, expiring and idempotently join real members', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Decide next steps');
  const invite = await f.service.invite('alice', room.id);
  assert.notEqual(f.rows.get(room.id)!.invite_hash, invite.code);
  assert.equal(f.rows.get(room.id)!.document.members.length, 1);
  const joined = await f.service.join('bob', 'Bob', invite.code);
  assert.equal(joined.members.length, 2);
  assert.equal((await f.service.join('bob', 'Bob', invite.code)).members.length, 2);
  await assert.rejects(f.service.invite('bob', room.id), /Only the owner/);
  const second = await f.service.invite('alice', room.id);
  await assert.rejects(f.service.join('charlie', 'Charlie', invite.code), /invalid or expired/);
  f.rows.get(room.id)!.invite_expires_at = new Date(0).toISOString();
  await assert.rejects(f.service.join('charlie', 'Charlie', second.code), /invalid or expired/);
});
test('messages and transcript authors are server-owned; retries cannot duplicate discussion', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps'), key = randomUUID();
  const first = await f.service.command('alice', room.id, { type: 'message', id: key, text: 'Agree the pilot.', kind: 'transcript', author: 'Spoof' } as any);
  const again = await f.service.command('alice', room.id, { type: 'message', id: key, text: 'Agree the pilot.', kind: 'transcript' });
  assert.equal(first.messages[0].author, 'Alice'); assert.equal(again.messages.length, 1);
  await assert.rejects(f.service.command('bob', room.id, { type: 'message', id: randomUUID(), text: 'Bad', kind: 'idea' }), /not found/);
});
test('assignments persist and only assignee or owner can change completion', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  const invite = await f.service.invite('alice', room.id);
  await f.service.join('bob', 'Bob', invite.code); await f.service.join('charlie', 'Charlie', invite.code);
  const key = randomUUID();
  await f.service.command('alice', room.id, { type: 'action', id: key, task: 'Call customer', ownerId: 'bob' });
  await assert.rejects(f.service.command('charlie', room.id, { type: 'complete', id: key, completed: true }), /assignee/);
  const saved = await f.service.command('bob', room.id, { type: 'complete', id: key, completed: true });
  assert.equal(saved.actions[0].completed, true);
  await assert.rejects(f.service.command('alice', room.id, { type: 'action', id: randomUUID(), task: 'No owner', ownerId: 'mallory' }), /workspace member/);
});
test('shared knowledge is durable and included in grounded summaries, with attributed ownership', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  const key = randomUUID();
  await f.service.command('alice', room.id, { type: 'knowledge', id: key, title: 'Pilot facts', text: 'The pilot has two teams.' });
  await f.service.command('alice', room.id, { type: 'message', id: randomUUID(), kind: 'idea', text: 'Pilot starts Monday.' });
  const result = await f.service.assist('alice', room.id, 'summary');
  assert.match(result.summary, /Pilot starts Monday/); assert.match(result.summary, /Pilot facts/);
  assert.ok(result.summaryThrough); assert.equal(result.actions.length, 1);
  await f.service.command('alice', room.id, { type: 'complete', id: result.actions[0].id, completed: true });
  const reloaded = (await createBusinessService(() => f.repository, async (): Promise<any> => {}).owned('alice', room.id)).document;
  assert.equal(reloaded.actions[0].completed, true); assert.equal(reloaded.knowledge[0].authorId, 'alice');
});
test('optimistic retries preserve updates and never replay paid AI inference', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  await f.service.command('alice', room.id, { type: 'message', id: randomUUID(), text: 'Decision', kind: 'idea' });
  f.conflict(2);
  await f.service.assist('alice', room.id, 'analysis');
  assert.deepEqual(f.stats(), { modelCalls: 1, claimCalls: 1 });
  f.conflict(4);
  await assert.rejects(f.service.command('alice', room.id, { type: 'message', id: randomUUID(), text: 'Not saved', kind: 'idea' }), /Another participant/);
});
test('AI failure produces no canned success message or fabricated tasks', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  await f.service.command('alice', room.id, { type: 'message', id: randomUUID(), text: 'Decision', kind: 'idea' });
  const broken = createBusinessService(() => f.repository, async (): Promise<any> => {}, async () => { throw Error('provider unavailable'); }, async () => {});
  await assert.rejects(broken.assist('alice', room.id, 'analysis'), /provider unavailable/);
  const saved = (await f.service.owned('alice', room.id)).document;
  assert.equal(saved.messages.length, 1); assert.equal(saved.actions.length, 0);
});
test('room commands validate member, knowledge-owner, format, limits and meeting ownership', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  assert.throws(() => applyBusinessCommand(room, 'alice', { type: 'unknown' } as any), /Unknown/);
  assert.throws(() => applyBusinessCommand(room, 'bob', { type: 'meeting', open: true }), /not found/);
  assert.throws(() => applyBusinessCommand(room, 'alice', { type: 'message', id: randomUUID(), text: '', kind: 'idea' }), /Enter text/);
  const joined = await f.service.join('bob', 'Bob', (await f.service.invite('alice', room.id)).code);
  assert.throws(() => applyBusinessCommand(joined, 'bob', { type: 'meeting', open: true }), /Only the workspace owner/);
});
test('meeting audio accepts supported real headers and rejects masquerading or oversize input', () => {
  const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]).toString('base64');
  assert.equal(validateMeetingAudio({ data: audio, mimeType: 'audio/webm;codecs=opus' }).mimeType, 'audio/webm');
  assert.throws(() => validateMeetingAudio({ data: Buffer.from('not audio').toString('base64'), mimeType: 'audio/webm' }), /unsupported/);
  assert.throws(() => validateMeetingAudio({ data: '!', mimeType: 'audio/webm' }), /valid short/);
  assert.throws(() => validateMeetingAudio({ data: Buffer.alloc(1050000).toString('base64'), mimeType: 'audio/webm' }), /valid short|at most/);
});
test('co-pilot speech produces bounded playable mono PCM WAV without inventing audio', () => {
  const pcm = Buffer.alloc(2400), wave = pcmWave(pcm);
  assert.equal(wave.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wave.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wave.readUInt32LE(24), 24000);
  assert.equal(wave.readUInt32LE(40), pcm.length);
  assert.throws(() => pcmWave(Buffer.alloc(0)), /invalid speech/);
  assert.throws(() => pcmWave(Buffer.alloc(3)), /invalid speech/);
});
test('authenticated HTTP workflow requires member and open meeting before issuing media; cancel cannot refund elapsed use', async () => {
  const f = fixture(), room = await f.service.create('alice', 'Alice', 'Project', 'Next steps');
  let issues = 0, cancel: boolean | undefined;
  const media = {
    async issue() { issues++; return { leaseId: 'fixture-lease', endsAt: Date.now() + 60000,
      appId: 'fixture', token: 'fixture', channelName: 'fixture', uid: 1, agoraUid: 1, expiresAt: Date.now() + 60000, isMock: false }; },
    async lease(): Promise<any> { return {}; }, async confirm() {}, async finish(_id: string, value?: boolean) { cancel = value; },
    async transcribe() { return 'A consented transcript.'; }, async translate() { return { text: 'Bonjour' }; },
    async speak() { return { audioBase64: '', mimeType: 'audio/wav', excerpt: false, nextOffset: null }; },
  };
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { if (req.header('x-fixture-user')) req.authUser = { id: req.header('x-fixture-user'), name: 'Fixture' }; next(); });
  app.use('/rooms', createBusinessRouter(f.service, media));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}/rooms`;
  const post = (path: string, body: unknown, user = 'alice') => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fixture-user': user }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(origin)).status, 401);
    assert.equal((await post(`/${room.id}/token`, {}, 'bob')).status, 404);
    assert.equal((await post(`/${room.id}/token`, {})).status, 409); assert.equal(issues, 0);
    await post(`/${room.id}/command`, { type: 'meeting', open: true });
    assert.equal((await post(`/${room.id}/token`, {})).status, 200); assert.equal(issues, 1);
    const transcript = await (await post(`/${room.id}/transcribe`, { leaseId: 'fixture-lease', audio: {} })).json() as any;
    assert.equal(transcript.room.messages[0].authorId, 'alice');
    await post(`/${room.id}/media/end`, { leaseId: 'fixture-lease', cancel: true });
    assert.equal(cancel, false);
    const closed = await (await post(`/${room.id}/command`, { type: 'meeting', open: false })).json() as any;
    assert.match(closed.room.summary, /summary/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('Supabase migration is repeatable, restricts browser roles and snapshots future benefits without touching existing terms', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE nanivio_malvi_subscriptions(subscription_id text primary key,tier text,video_minutes_allowed int,current_period_end timestamptz);
      CREATE TABLE nanivio_malvi_plan_catalog(document jsonb);
      INSERT INTO nanivio_malvi_subscriptions VALUES('old','malvi_premium',333,'2030-01-01');
      INSERT INTO nanivio_malvi_plan_catalog VALUES('{"snapshot":{"plans":[{"tier":"malvi_premium","status":"PUBLISHED","capabilities":["conversation","voice","research"]}]}}');`);
    const sql = await readFile('migrations/020_malvi_business_rooms.sql', 'utf8');
    await pg.exec(sql); await pg.exec(sql);
    await pg.exec(`INSERT INTO nanivio_malvi_subscriptions(subscription_id,tier,video_minutes_allowed,current_period_end) VALUES('new','malvi_premium',300,'2030-02-01')`);
    const rows = (await pg.query<any>('SELECT * FROM nanivio_malvi_subscriptions ORDER BY subscription_id')).rows;
    assert.deepEqual(rows[0].capabilities, ['conversation', 'voice', 'research']);
    assert.equal(rows[1].capabilities, null); assert.equal(rows[1].video_minutes_allowed, 333);
    const privileges = (await pg.query<any>("SELECT has_table_privilege('anon','nanivio_malvi_business_rooms','SELECT') allowed")).rows[0];
    assert.equal(privileges.allowed, false);
    await pg.exec(`CREATE TABLE nanivio_payments(provider text,purpose text,status text,provider_reference text,metadata jsonb);
      INSERT INTO nanivio_payments VALUES('paystack','MALVI_SUBSCRIPTION','PAID','fixture-paid','{"planSnapshot":{"capabilities":["conversation","voice","multimodal"]}}');
      INSERT INTO nanivio_malvi_subscriptions(subscription_id,tier) VALUES('malvi_fixture-paid','malvi_premium');`);
    const purchased = (await pg.query<any>("SELECT capabilities FROM nanivio_malvi_subscriptions WHERE subscription_id='malvi_fixture-paid'")).rows[0];
    assert.deepEqual(purchased.capabilities, ['conversation', 'voice', 'multimodal']);
  } finally { await pg.close(); }
});
