import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { PersistentDeletionRequests, DeletionRequestError } from '../src/server/accountDeletionRequests';
import { registerAccountDeletionRoutes } from '../src/server/accountDeletionRoutes';
import { deletionRequestApi } from '../src/lib/accountDeletion';
import { createSignupEmailSender } from '../src/server/signupEmailDelivery';

const db = new PGlite();
const deliveries: { email: string; code: string; purpose?: string }[] = [];
const fakeDb: any = {
  rpc(name: string, params: Record<string, unknown>) {
    const rpc: Record<string, string[]> = {
      nanivio_reserve_deletion_challenge: ['p_email','p_email_hash','p_ip_hash','p_id','p_code_hash'],
      nanivio_mark_deletion_email_sent: ['p_id'],
      nanivio_confirm_deletion_request: ['p_id','p_code_hash'],
    };
    const keys = rpc[name];
    assert.ok(keys, 'Only the deletion RPCs are allowed in this fixture');
    return { async abortSignal() {
      const values = keys.map(key => params[key]);
      try {
        const result = await db.query(`SELECT ${name}(${keys.map((_, i) => `$${i+1}`).join(',')}) AS value`, values);
        return { data: (result.rows[0] as any).value, error: null };
      } catch { return { data: null, error: { message: 'fixture failure' } }; }
    } };
  },
};
const service = new PersistentDeletionRequests(
  () => fakeDb, async (email, code, purpose) => { deliveries.push({ email, code, purpose }); },
  () => {}, () => 'fixture-only-hmac-secret',
);
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_users(id text PRIMARY KEY, email text, status text);`);
  await db.exec(await readFile('migrations/029_account_deletion_requests.sql', 'utf8'));
});
after(async () => { await db.close(); });
beforeEach(async () => {
  deliveries.length = 0;
  await db.exec(`TRUNCATE nanivio_users,nanivio_deletion_limits,nanivio_deletion_challenges,nanivio_deletion_requests;
    INSERT INTO nanivio_users VALUES ('owner-A','a@example.test','ACTIVE'),('owner-B','b@example.test','DEACTIVATED');`);
});

test('real SQL saves a verified request, hashes codes and never deletes or deactivates users', async () => {
  const id = await service.challenge('a@example.test', 'fixture-ip');
  assert.equal(deliveries[0].purpose, 'account-deletion');
  const stored: any = (await db.query('SELECT * FROM nanivio_deletion_challenges')).rows[0];
  assert.notEqual(stored.code_hash, deliveries[0].code);
  const receipt = await service.confirm(id, deliveries[0].code);
  assert.equal(receipt.status, 'pending_review');
  const request: any = (await db.query('SELECT * FROM nanivio_deletion_requests')).rows[0];
  assert.equal(request.owner_id, 'owner-A');
  assert.equal(request.completed_at, null);
  assert.equal((await db.query<{status:string}>("SELECT status FROM nanivio_users WHERE id='owner-A'")).rows[0].status, 'ACTIVE');
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM nanivio_users')).rows[0].n, 2);
});
test('replayed confirmation and a second proof cannot create duplicate requests', async () => {
  const id = await service.challenge('a@example.test', 'fixture-ip');
  const first = await service.confirm(id, deliveries[0].code);
  assert.deepEqual(await service.confirm(id, deliveries[0].code), first);
  await db.exec("UPDATE nanivio_deletion_limits SET window_start=now()-interval '2 hours'");
  const second = await service.challenge('a@example.test', 'fixture-ip');
  assert.deepEqual(await service.confirm(second, deliveries[1].code), first);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM nanivio_deletion_requests')).rows[0].n, 1);
});
test('a code is bound to its challenge and five wrong attempts lock it', async () => {
  const a = await service.challenge('a@example.test', 'fixture-ip');
  const b = await service.challenge('b@example.test', 'fixture-ip');
  const invalid = deliveries[1].code === deliveries[0].code ? '000000' : deliveries[1].code;
  for (let i=0; i<5; i++) await assert.rejects(service.confirm(a, invalid), /invalid/);
  await assert.rejects(service.confirm(a, deliveries[0].code), /invalid/);
  assert.equal((await service.confirm(b, deliveries[1].code)).status, 'pending_review');
  assert.equal((await db.query<{owner_id:string}>('SELECT owner_id FROM nanivio_deletion_requests')).rows[0].owner_id, 'owner-B');
});
test('expired, unsent and unknown challenges cannot create a request', async () => {
  const id = await service.challenge('a@example.test', 'fixture-ip');
  await db.exec('UPDATE nanivio_deletion_challenges SET sent=false');
  await assert.rejects(service.confirm(id, deliveries[0].code), /invalid/);
  await db.exec("UPDATE nanivio_deletion_challenges SET sent=true,expires_at=now()-interval '1 second'");
  await assert.rejects(service.confirm(id, deliveries[0].code), /invalid/);
  const unknown = await service.challenge('unknown@example.test', 'fixture-ip');
  await assert.rejects(service.confirm(unknown, '123456'), /invalid/);
  assert.equal(deliveries.length, 1);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM nanivio_deletion_requests')).rows[0].n, 0);
});
test('persistent cooldown and email limits apply to known and unknown emails', async () => {
  for (const email of ['a@example.test', 'unknown@example.test']) {
    await service.challenge(email, 'fixture-ip');
    await assert.rejects(service.challenge(email, 'fixture-ip'), (e: any) => e.status===429);
  }
});
test('an uncertain email delivery is not marked sent and returns no provider details', async () => {
  const failing = new PersistentDeletionRequests(() => fakeDb,
    async () => { throw Error('PRIVATE_PROVIDER_DETAIL'); }, () => {}, () => 'fixture-only-hmac-secret');
  const id = await failing.challenge('a@example.test', 'fixture-ip');
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal((await db.query<{sent:boolean}>('SELECT sent FROM nanivio_deletion_challenges')).rows[0].sent, false);
});
test('missing persistence or signing secret fails closed', async () => {
  const missingDb = new PersistentDeletionRequests(() => null, async () => {}, () => {}, () => 'fixture');
  await assert.rejects(missingDb.challenge('a@example.test', 'fixture-ip'), (e: any) => e.status===503);
  const missingSecret = new PersistentDeletionRequests(() => fakeDb, async () => {}, () => {}, () => undefined);
  await assert.rejects(missingSecret.challenge('a@example.test', 'fixture-ip'), (e: any) => e.status===503);
});
test('anon and authenticated roles cannot inspect challenges/requests or call service RPCs', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query('SELECT * FROM nanivio_deletion_challenges'));
      await assert.rejects(db.query('SELECT * FROM nanivio_deletion_requests'));
      await assert.rejects(db.query("SELECT nanivio_confirm_deletion_request(gen_random_uuid(),'guess')"));
    } finally { await db.exec('RESET ROLE'); }
  }
});

test('public routes require email proof and exact DELETE; current status always uses session owner', async () => {
  const app = express(); app.use(express.json());
  const calls: any[] = [];
  registerAccountDeletionRoutes(app, {
    requests: {
      challenge: async (email, ip) => { calls.push({ email, ip }); return 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; },
      confirm: async (id, code) => { calls.push({ id, code }); return {id:'fixture-request',status:'pending_review',requestedAt:new Date().toISOString()}; },
      current: async owner => { calls.push({owner}); return null; },
    },
    getUser: async req => req.headers['x-fixture-auth'] ? { id:'owner-A' } : null,
  });
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  const root = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (path: string, body: any) => fetch(root+'/api/account-deletion/'+path, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  try {
    assert.equal((await post('challenge',{email:'bad'})).status,400);
    const challenge = await post('challenge',{email:' A@EXAMPLE.TEST ',ownerId:'owner-B'});
    assert.equal(challenge.headers.get('cache-control'),'no-store');
    assert.equal((await challenge.json()).challengeId,'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    assert.equal(calls[0].email,'a@example.test');
    for (const confirmation of [undefined, 'DEACTIVATE', 'delete']) {
      assert.equal((await post('requests',{challengeId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',code:'123456',confirmation})).status,400);
    }
    const response = await post('requests',{challengeId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',code:'123456',confirmation:'DELETE',ownerId:'owner-B'});
    assert.equal(response.status,202);
    assert.equal((await response.json()).dataDeleted,false);
    assert.equal((await fetch(root+'/api/account-deletion/request')).status,401);
    assert.equal((await fetch(root+'/api/account-deletion/request?ownerId=owner-B',{headers:{'x-fixture-auth':'yes'}})).status,200);
    assert.deepEqual(calls.at(-1),{owner:'owner-A'});
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
test('browser helper requires explicit saved-request acknowledgment and retains failure semantics', async () => {
  for (const response of [
    Response.json({success:true}), Response.json({success:false,error:'Fixture unavailable'},{status:503}),
    new Response('not json'), Response.json({success:true,action:'DELETION_REQUESTED',dataDeleted:true,request:{}}),
  ]) {
    await assert.rejects(deletionRequestApi('requests',{confirmation:'DELETE'},async()=>response));
  }
  let init: RequestInit | undefined;
  const result = await deletionRequestApi('requests', {confirmation:'DELETE'},async (_url, options) => {
    init=options; return Response.json({success:true,action:'DELETION_REQUESTED',dataDeleted:false,
      request:{id:'fixture',status:'pending_review',requestedAt:new Date().toISOString()}},{status:202});
  });
  assert.equal(init!.credentials,'same-origin');
  assert.equal(result.request.status,'pending_review');
});
test('deletion verification email clearly distinguishes requesting deletion from signup and completion', async () => {
  let message: any;
  const send = createSignupEmailSender(
    ()=>({RESEND_TRANSPORT:'connector',RESEND_FROM_EMAIL:'fixture@example.test'}),
    async()=>{throw Error('Direct delivery forbidden');},
    async body=>{message=JSON.parse(body);return Response.json({id:'fixture-email'});},
  );
  await send('a@example.test','123456','account-deletion');
  assert.match(message.subject,/deletion request/);
  assert.match(message.text,/does not immediately erase/);
  assert.match(message.text,/ignore this email/);
});
