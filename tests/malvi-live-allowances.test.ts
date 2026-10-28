import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_users(id TEXT PRIMARY KEY);
    CREATE TABLE nanivio_malvi_subscriptions(
      subscription_id TEXT PRIMARY KEY,user_id TEXT,tier TEXT,status TEXT,
      current_period_start TIMESTAMPTZ,current_period_end TIMESTAMPTZ,updated_at TIMESTAMPTZ,
      voice_minutes_allowed NUMERIC(20,6),voice_minutes_used NUMERIC(20,6) DEFAULT 0,
      video_minutes_allowed NUMERIC(20,6),video_minutes_used NUMERIC(20,6) DEFAULT 0);
    CREATE TABLE malvi_credit_accounts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT UNIQUE,
      credit_balance NUMERIC(18,6),version BIGINT DEFAULT 0,updated_at TIMESTAMPTZ);
    CREATE TABLE malvi_credit_ledger(id UUID DEFAULT gen_random_uuid(),account_id UUID,user_id TEXT,direction TEXT,
      amount NUMERIC(18,6),credit_type TEXT,reference TEXT,source TEXT,status TEXT,metadata JSONB,UNIQUE(user_id,reference));
    INSERT INTO nanivio_users VALUES('a'),('b');
    INSERT INTO nanivio_malvi_subscriptions
      SELECT id||'_sub',id,'malvi_basic','ACTIVE',now()-interval '1 day',now()+interval '1 day',now(),5,0,3,0 FROM nanivio_users;
    INSERT INTO malvi_credit_accounts(user_id,credit_balance) VALUES('a',5),('b',5);`);
  await db.exec(await fs.readFile('migrations/013_malvi_live_allowances.sql', 'utf8'));
  await db.exec('UPDATE nanivio_malvi_runtime_policy SET live_minutes_monthly=100,research_monthly=2,analyses_monthly=2,upload_mib_monthly=1');
  return db;
}
const reserve = async (db: PGlite, owner: string, id: string, mode = 'avatar') =>
  (await db.query<{ value: any }>('SELECT nanivio_reserve_malvi_live($1,$2,$3,600) AS value', [owner,id,mode])).rows[0].value;
const finish = (db: PGlite, id: string, cancel = false, reconcile = false) =>
  db.query('SELECT nanivio_finish_malvi_live($1,$2,$3)', [id,cancel,reconcile]);

test('real SQL caps live sessions, escrows existing credit, refunds failed setup once and preserves purchased terms', async () => {
  const db = await fixture();
  try {
    const before = (await db.query('SELECT * FROM nanivio_malvi_subscriptions WHERE user_id=$1',['a'])).rows[0];
    assert.equal((await reserve(db,'a','session-a')).seconds,180);
    assert.equal((await db.query<{credit_balance:string}>("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='a'")).rows[0].credit_balance,'2.000000');
    await assert.rejects(reserve(db,'a','second'),/MALVI_SESSION_ACTIVE/);
    assert.equal((await reserve(db,'a','session-a')).success,true);
    await assert.rejects(reserve(db,'b','session-a'),/MALVI_RESERVATION_OWNER/);
    await finish(db,'session-a',true);
    await finish(db,'session-a',true);
    const after = (await db.query('SELECT * FROM nanivio_malvi_subscriptions WHERE user_id=$1',['a'])).rows[0];
    assert.deepEqual(after,before);
    assert.equal((await db.query<{credit_balance:string}>("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='a'")).rows[0].credit_balance,'5.000000');
    assert.equal((await db.query('SELECT * FROM malvi_credit_ledger')).rows.length,2);
    assert.equal((await reserve(db,'b','voice-b','voice')).seconds,300);
    await finish(db,'voice-b',true);
  } finally { await db.close(); }
});

test('live allowance refuses empty credit, expired terms, exhausted mode and avatar use on Voice plans', async () => {
  const db = await fixture();
  try {
    await db.exec("UPDATE malvi_credit_accounts SET credit_balance=0 WHERE user_id='a'");
    await assert.rejects(reserve(db,'a','empty'),/MALVI_ALLOWANCE_EXHAUSTED/);
    await db.exec("UPDATE malvi_credit_accounts SET credit_balance=5 WHERE user_id='a'; UPDATE nanivio_malvi_subscriptions SET current_period_end=now()-interval '1 day' WHERE user_id='a'");
    await assert.rejects(reserve(db,'a','expired'),/MALVI_PLAN_REQUIRED/);
    await db.exec("UPDATE nanivio_malvi_subscriptions SET current_period_end=now()+interval '1 day',video_minutes_used=3 WHERE user_id='a'");
    await assert.rejects(reserve(db,'a','spent'),/MALVI_ALLOWANCE_EXHAUSTED/);
    await db.exec("UPDATE nanivio_malvi_subscriptions SET tier='malvi_voice',video_minutes_used=0 WHERE user_id='a'");
    await assert.rejects(reserve(db,'a','avatar'),/MALVI_AVATAR_NOT_INCLUDED/);
    assert.equal((await reserve(db,'a','voice','voice')).seconds,300);
  } finally { await db.close(); }
});

test('crash reconciliation charges only confirmed server time and cannot revive or double-refund a lease', async () => {
  const db = await fixture();
  try {
    await reserve(db,'a','crashed');
    await assert.rejects(finish(db,'crashed',false,true),/MALVI_SESSION_ACTIVE/);
    await db.exec(`UPDATE nanivio_malvi_live_leases SET started_at=now()-interval '200 seconds',
      ends_at=now()-interval '20 seconds',confirmed_at=now()-interval '140 seconds' WHERE lease_id='crashed'`);
    assert.equal((await db.query<{ok:boolean}>("SELECT nanivio_confirm_malvi_live('crashed') AS ok")).rows[0].ok,false);
    await finish(db,'crashed',false,true);
    await finish(db,'crashed',false,true);
    const lease = (await db.query<{charged_seconds:number}>("SELECT charged_seconds FROM nanivio_malvi_live_leases WHERE lease_id='crashed'")).rows[0];
    assert.equal(lease.charged_seconds,60);
    const account = (await db.query<{credit_balance:string}>("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='a'")).rows[0];
    assert.equal(account.credit_balance,'4.000000');
    await assert.rejects(reserve(db,'a','crashed'),/MALVI_RESERVATION_EXPIRED/);
    assert.equal((await reserve(db,'a','replacement')).seconds,120);
  } finally { await db.close(); }
});

test('anonymous and browser-authenticated database roles cannot debit, refund or read live leases', async () => {
  const db = await fixture();
  try {
    for (const role of ['anon','authenticated']) {
      await db.exec('SET ROLE '+role);
      await assert.rejects(reserve(db,'a','unauthorised'),/permission denied/);
      await assert.rejects(finish(db,'anything',true),/permission denied/);
      await assert.rejects(db.query('SELECT * FROM nanivio_malvi_live_leases'),/permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});

test('shared fleet cap and per-account research/analysis byte caps are durable and atomic', async () => {
  const db = await fixture();
  try {
    await db.exec('UPDATE nanivio_malvi_runtime_policy SET live_minutes_monthly=3');
    await reserve(db,'a','fleet-a');
    await assert.rejects(reserve(db,'b','fleet-b'),/MALVI_SHARED_LIMIT/);
    await finish(db,'fleet-a',true);
    assert.equal((await reserve(db,'b','fleet-b')).seconds,180);
    const claim = (user: string,kind: string,bytes=0) => db.query('SELECT nanivio_claim_malvi_request($1,$2,$3)',[user,kind,bytes]);
    await claim('a','research'); await claim('a','research');
    await assert.rejects(claim('a','research'),/MALVI_REQUEST_LIMIT/);
    await claim('b','research');
    await claim('a','analysis',1048576);
    await assert.rejects(claim('a','analysis',1),/MALVI_REQUEST_LIMIT/);
    await claim('a','analysis',0);
    await assert.rejects(claim('a','analysis',0),/MALVI_REQUEST_LIMIT/);
    await db.exec('UPDATE nanivio_malvi_runtime_policy SET research_monthly=NULL');
    await assert.rejects(claim('b','research'),/MALVI_RUNTIME_LIMITS_REQUIRED/);
    await db.exec('UPDATE nanivio_malvi_runtime_policy SET research_monthly=0');
    await assert.rejects(claim('b','research'),/MALVI_REQUEST_LIMIT/);
  } finally { await db.close(); }
});

test('runtime settings use audited optimistic concurrency and entitlement credit retries never duplicate funds', async () => {
  const db = await fixture();
  try {
    const limits = {live_minutes_monthly:20,research_monthly:10,analyses_monthly:5,upload_mib_monthly:2};
    const save = (version: number) => db.query('SELECT nanivio_save_malvi_runtime_limits($1::jsonb,$2,$3,$4)',[JSON.stringify(limits),version,'finance-owner','Review actual provider allowance']);
    await save(0);
    await assert.rejects(save(0),/MALVI_POLICY_CONFLICT/);
    assert.equal((await db.query('SELECT * FROM nanivio_malvi_runtime_audit')).rows.length,1);
    const payload = {userId:'a',amount:2,reference:'entitlement-same',source:'MALVI_SUBSCRIPTION',creditType:'MALVI_MINUTES'};
    const credit = () => db.query("SELECT nanivio_malvi_credit_command('CREDIT',$1::jsonb)",[JSON.stringify(payload)]);
    await Promise.all([credit(),credit()]);
    assert.equal((await db.query<{credit_balance:string}>("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='a'")).rows[0].credit_balance,'7.000000');
    await assert.rejects(db.query("SELECT nanivio_malvi_credit_command('CREDIT',$1::jsonb)",[JSON.stringify({...payload,amount:3})]),/MALVI_CREDIT_REFERENCE_CONFLICT/);
  } finally { await db.close(); }
});
