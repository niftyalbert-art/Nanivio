import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { accessDeletionAdapter, billingDeletionAdapter, storageDeletionAdapter,
  operationsVerificationAdapter } from '../src/server/accountDeletionOperations';
import { createDeletionFileTransport } from '../src/server/accountDeletionFiles';

const db = new PGlite();
const request = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const token = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const context = { requestId: request, ownerId: 'owner-A', leaseToken: token, policy: {} as any };
const query = (sql: string, values: any[] = []) => db.query<any>(sql, values);
const command = async (_context: any, action: string, payload = {}) =>
  (await query('SELECT nanivio_deletion_operations($1,$2,$3,$4) result',
    [request, token, action, JSON.stringify(payload)])).rows[0].result;
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_users(id text PRIMARY KEY,status text,avatar text,updated_at timestamptz,erased_at timestamptz,
      wallet_balance_ghs numeric DEFAULT 0,wallet_balance_usd numeric DEFAULT 0);
    CREATE TABLE nanivio_deletion_requests(id uuid PRIMARY KEY);
    CREATE TABLE nanivio_deletion_jobs(request_id uuid PRIMARY KEY REFERENCES nanivio_deletion_requests,
      owner_id text,state text,lease_token uuid,lease_until timestamptz);
    CREATE TABLE nanivio_deletion_steps(request_id uuid,step text,state text,PRIMARY KEY(request_id,step));
    CREATE TABLE nanivio_subscriptions(id text PRIMARY KEY,user_id text,auto_renew boolean,
      current_period_end timestamptz,provider_subscription_code text);
    CREATE TABLE nanivio_malvi_subscriptions(LIKE nanivio_subscriptions INCLUDING ALL);
    CREATE TABLE nanivio_wallets(id text PRIMARY KEY,user_id text,available numeric,reserved numeric,promotional numeric);
    CREATE TABLE nanivio_credit_accounts(id text PRIMARY KEY,user_id text,balance numeric);
    CREATE TABLE malvi_credit_accounts(id text PRIMARY KEY,user_id text,credit_balance numeric);
    CREATE TABLE nanivio_payments(id text PRIMARY KEY,user_id text,status text);
    CREATE TABLE nanivio_refunds(LIKE nanivio_payments INCLUDING ALL);
    CREATE TABLE nanivio_disputes(LIKE nanivio_payments INCLUDING ALL);
    CREATE TABLE nanivio_paystack_orders(LIKE nanivio_payments INCLUDING ALL);
    CREATE TABLE nanivio_tron_invoices(LIKE nanivio_payments INCLUDING ALL);
    CREATE TABLE nanivio_plan_stored_objects(object_id text PRIMARY KEY,user_id text,
      size_bytes bigint,kind text,channel_id text,file_name text,url text,state text,created_at timestamptz);
  `);
  const local = await readFile('migrations/031_account_deletion_local_cleanup.sql', 'utf8');
  await db.exec(local.slice(local.indexOf('CREATE OR REPLACE FUNCTION public.nanivio_private_owner_active'),
    local.indexOf('DO $$')));
  await db.exec(await readFile('migrations/032_account_deletion_operations.sql', 'utf8'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE nanivio_deletion_operation_reviews,nanivio_deletion_jobs,
    nanivio_deletion_requests,nanivio_deletion_steps,nanivio_users,nanivio_subscriptions,
    nanivio_malvi_subscriptions,nanivio_wallets,nanivio_credit_accounts,malvi_credit_accounts,
    nanivio_payments,nanivio_refunds,nanivio_disputes,nanivio_paystack_orders,
    nanivio_tron_invoices,nanivio_plan_stored_objects CASCADE;
    INSERT INTO nanivio_users(id,status,avatar) VALUES ('owner-A','ACTIVE','data:image/png;base64,fixture'),('owner-B','ACTIVE','other');
    INSERT INTO nanivio_deletion_requests VALUES ('${request}');
    INSERT INTO nanivio_deletion_jobs(request_id,owner_id,state,lease_token,lease_until)
      VALUES ('${request}','owner-A','processing','${token}',now()+interval '2 minutes');
    INSERT INTO nanivio_deletion_steps VALUES ('${request}','access','started');
    INSERT INTO nanivio_subscriptions VALUES ('a','owner-A',true,now()+interval '1 month','external-fixture'),
      ('b','owner-B',true,now()+interval '1 month',null);
    INSERT INTO nanivio_malvi_subscriptions VALUES ('ma','owner-A',true,now()+interval '1 month',null);`);
});
async function reviewAccess(future = false) {
  await command(context, 'FREEZE');
  const evidence = Object.fromEntries(['agora', 'stream', 'azure', 'liveavatar', 'palabra', 'gemini'].map(
    provider => [provider, { reference: 'fixture-provider-proof', issuanceStoppedAt: new Date().toISOString(),
      notAfter: new Date(Date.now() + (future ? 3600000 : -1000)).toISOString() }]));
  // PGlite and JS clocks can differ slightly; use SQL's freeze/clock values.
  await query(`INSERT INTO nanivio_deletion_operation_reviews(request_id,access_reference,access_evidence)
    VALUES ($1,'fixture-review',$2)`, [request, JSON.stringify(evidence)]);
  await query(`UPDATE nanivio_deletion_operation_reviews SET access_evidence=(
    SELECT jsonb_object_agg(key,value||jsonb_build_object('issuanceStoppedAt',clock_timestamp()))
    FROM jsonb_each(access_evidence)) WHERE request_id=$1`, [request]);
}
async function verifyAccess() {
  await reviewAccess();
  assert.equal((await command(context, 'ACCESS')).verified, true);
  await query(`UPDATE nanivio_deletion_steps SET state='verified' WHERE step='access'`);
}
async function reviewBilling() {
  const inventory = await command(context, 'BILLING_INVENTORY');
  await query(`UPDATE nanivio_deletion_operation_reviews SET billing_digest=$2,billing_reference='fixture-finance-review'
    WHERE request_id=$1`, [request, inventory.digest]);
}
async function reviewStorage() {
  await query(`INSERT INTO nanivio_deletion_steps VALUES ($1,'billing','verified')`, [request]);
  await query(`UPDATE nanivio_deletion_operation_reviews SET storage_inventory=nanivio_deletion_storage_inventory('owner-A'),
    storage_reference='fixture-shared-file-review' WHERE request_id=$1`, [request]);
}
test('missing or incomplete provider evidence blocks; established future expiry waits rather than claiming completion', async () => {
  await assert.rejects(accessDeletionAdapter(command).run(context), /REVIEW_REQUIRED/);
  assert.equal((await query(`SELECT status FROM nanivio_users WHERE id='owner-A'`)).rows[0].status, 'DEACTIVATED');
  assert.equal((await query(`SELECT status FROM nanivio_users WHERE id='owner-B'`)).rows[0].status, 'ACTIVE');
  await reviewAccess(true);
  assert.equal((await accessDeletionAdapter(command).run(context)).verified, false);
  await query(`UPDATE nanivio_deletion_operation_reviews SET access_evidence=access_evidence-'liveavatar'`);
  assert.equal((await command(context, 'ACCESS')).reviewRequired, true);
});
test('all providers must have reviewed absolute expiry or revocation evidence after issuance stopped', async () => {
  await verifyAccess();
  await query(`UPDATE nanivio_deletion_operation_reviews SET access_evidence=jsonb_set(access_evidence,
    '{agora,issuanceStoppedAt}','"2000-01-01T00:00:00Z"')`);
  assert.equal((await command(context, 'ACCESS')).reviewRequired, true);
});
test('billing stops both local renewals but requires inventory-bound external settlement review', async () => {
  await verifyAccess();
  await assert.rejects(billingDeletionAdapter(command).run(context), /REVIEW_REQUIRED/);
  const renewals = (await query(`SELECT auto_renew FROM nanivio_subscriptions WHERE user_id='owner-A'
    UNION ALL SELECT auto_renew FROM nanivio_malvi_subscriptions WHERE user_id='owner-A'`)).rows;
  assert.ok(renewals.every(row => !row.auto_renew));
  assert.equal((await query(`SELECT auto_renew FROM nanivio_subscriptions WHERE user_id='owner-B'`)).rows[0].auto_renew, true);
  await reviewBilling();
  assert.equal((await billingDeletionAdapter(command).run(context)).verified, true);
  await query(`INSERT INTO nanivio_payments VALUES ('late','owner-A','PENDING')`);
  await assert.rejects(billingDeletionAdapter(command).run(context), /REVIEW_REQUIRED/);
  await reviewBilling(); // Approval alone cannot waive a pending payment.
  await assert.rejects(billingDeletionAdapter(command).run(context), /REVIEW_REQUIRED/);
});
test('nonzero available/reserved/promotional credits cannot be forfeited even by a matching review', async () => {
  await verifyAccess();
  for (const column of ['available', 'reserved', 'promotional']) {
    await db.exec(`DELETE FROM nanivio_wallets; INSERT INTO nanivio_wallets(id,user_id,${column}) VALUES ('funds','owner-A',4)`);
    await reviewBilling();
    await assert.rejects(billingDeletionAdapter(command).run(context), /REVIEW_REQUIRED/);
    assert.equal(Number((await query(`SELECT ${column} amount FROM nanivio_wallets`)).rows[0].amount), 4);
  }
});
test('frozen owners cannot renew, extend terms or add stored objects; other owners remain unaffected', async () => {
  await command(context, 'FREEZE');
  await assert.rejects(query(`UPDATE nanivio_subscriptions SET current_period_end=now()+interval '1 year' WHERE user_id='owner-A'`));
  await assert.rejects(query(`INSERT INTO nanivio_plan_stored_objects(object_id,user_id) VALUES ('late','owner-A')`));
  await query(`UPDATE nanivio_subscriptions SET current_period_end=now()+interval '1 year' WHERE user_id='owner-B'`);
});
async function addFile(id: string, owner = 'owner-A', url = `https://us-east.stream-io-cdn.com/${id}`) {
  await query(`INSERT INTO nanivio_plan_stored_objects VALUES ($1,$2,10,'chat','fixture-channel','file',$3,'STORED',now())`, [id, owner, url]);
}
test('owned file removal is verified, checkpointed and resumable without deleting other users files', async () => {
  await addFile('a'); await addFile('b'); await addFile('c'); await addFile('other', 'owner-B');
  await verifyAccess(); await reviewStorage();
  const deleted = new Set<string>(); const removals: string[] = [];
  const adapter = storageDeletionAdapter(command, {
    async absent(file) { return deleted.has(file.object_id); },
    async remove(file) { deleted.add(file.object_id); removals.push(file.object_id); },
  });
  assert.equal((await adapter.run(context)).verified, false);
  assert.equal((await adapter.run(context)).verified, true);
  assert.equal(removals.length, 3);
  assert.equal((await query(`SELECT count(*)::int n FROM nanivio_plan_stored_objects WHERE user_id='owner-B'`)).rows[0].n, 1);
});
test('shared URLs, unknown/new files and pending uploads block storage deletion', async () => {
  await addFile('shared'); await addFile('other', 'owner-B', 'https://us-east.stream-io-cdn.com/shared');
  await verifyAccess(); await reviewStorage();
  let removes = 0;
  const adapter = storageDeletionAdapter(command, { async absent() { return false; }, async remove() { removes++; } });
  await assert.rejects(adapter.run(context), /REVIEW_REQUIRED/);
  assert.equal(removes, 0);
});
test('provider acceptance without confirmed file absence never releases storage accounting', async () => {
  await addFile('a'); await verifyAccess(); await reviewStorage();
  const adapter = storageDeletionAdapter(command, { async absent() { return false; }, async remove() {} });
  await assert.rejects(adapter.run(context), /PROVIDER_OUTCOME_UNCONFIRMED/);
  assert.equal((await query(`SELECT count(*)::int n FROM nanivio_plan_stored_objects`)).rows[0].n, 1);
});
test('a stale worker lease cannot freeze or erase; ordinary roles cannot invoke operational RPC', async () => {
  await assert.rejects(query(`SELECT nanivio_deletion_operations($1,'cccccccc-cccc-4ccc-accc-cccccccccccc','FREEZE')`, [request]));
  await db.exec('SET ROLE authenticated');
  try { await assert.rejects(command(context, 'FREEZE')); } finally { await db.exec('RESET ROLE'); }
});
test('CDN validation blocks SSRF and expired signed links do not count as deletion', async () => {
  let calls = 0;
  const transport = createDeletionFileTransport(async () => { calls++; }, (async () => {
    calls++; return new Response(null, { status: 403 });
  }) as typeof fetch);
  for (const url of ['http://localhost/file', 'https://stream-io-cdn.com.evil.test/a', 'https://user@stream-io-cdn.com/a']) {
    await assert.rejects(transport.absent({ object_id: 'x', channel_id: 'fixture', url }));
  }
  assert.equal(calls, 0);
  assert.equal(await transport.absent({ object_id: 'x', channel_id: 'fixture', url: 'https://us-east.stream-io-cdn.com/file' }), false);
});
test('final verification cannot substitute a stale earlier billing or storage receipt', async () => {
  let local = 0;
  const adapter = operationsVerificationAdapter(async () => ({ verified: false }), {
    idempotent: true, async run() { local++; return { verified: true, receipt: { code: 'TEST' } }; },
  });
  await assert.rejects(adapter.run(context), /REVIEW_REQUIRED/);
  assert.equal(local, 0);
});
test('database completion also rejects forged receipts when operational proof is absent', async () => {
  await command(context, 'FREEZE');
  await assert.rejects(query(`UPDATE nanivio_deletion_jobs SET state='completed' WHERE request_id=$1`, [request]));
  assert.equal((await query(`SELECT state FROM nanivio_deletion_jobs`)).rows[0].state, 'processing');
});
test('waiting jobs remain frozen and private data cannot be reassigned to another account', async () => {
  await addFile('owned');
  await command(context, 'FREEZE');
  await query(`UPDATE nanivio_deletion_jobs SET state='queued'`);
  await assert.rejects(query(`UPDATE nanivio_plan_stored_objects SET user_id='owner-B' WHERE object_id='owned'`));
});
test('final operational verification passes an unchanged reviewed, drained and settled account', async () => {
  await verifyAccess(); await reviewBilling(); await reviewStorage();
  assert.equal((await command(context, 'VERIFY')).verified, true);
  await query(`UPDATE nanivio_deletion_jobs SET state='completed' WHERE request_id=$1`, [request]);
  assert.equal((await query(`SELECT state FROM nanivio_deletion_jobs`)).rows[0].state, 'completed');
});
