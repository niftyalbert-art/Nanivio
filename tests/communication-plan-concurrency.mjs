import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { postgresClient, literal } from './helpers/postgres-client.mjs';

// Uses committed rows and independent PostgreSQL sessions, not the in-memory engine.
// The caller must supply an isolated local database or an approved staging database.
export async function verifyCommunicationConcurrency(env) {
  const db = postgresClient(env);
  const prefix = `entitlement_test_${randomUUID().replaceAll('-', '')}`;
  const users = ['selection', 'mixed', 'boundary', 'exhaustion'].map((name) => `${prefix}_${name}`);
  const [selectionUser, mixedUser, boundaryUser, exhaustionUser] = users;
  const userList = users.map(literal).join(',');
  const plan = (userId, quota = 100) => ({
    userId, planId: `test_${quota}`, tier: 'test', planName: 'Isolated verification',
    billingCycle: 'MONTHLY', langpretationQuota: quota, voiceQuota: 100, malviQuota: 0,
  });
  const rpc = async (name, payload, extraEnv) => JSON.parse(await db.query(
    `SET ROLE service_role; SELECT /* ${extraEnv?.PGAPPNAME || 'entitlement-rpc'} */ public.${name}(${literal(JSON.stringify(payload))}::jsonb);`, extraEnv,
  ));
  const select = (userId, quota, extraEnv) =>
    rpc('nanivio_select_communication_plan', plan(userId, quota), extraEnv);
  const use = (userId, eventId, extraEnv) => rpc('nanivio_langpretation_usage', {
    userId, minutes: 1, channel: 'AUDIO_CALL', sessionId: `${prefix}_call`, eventId,
  }, extraEnv);
  const state = async (userId) => JSON.parse(await db.query(`
    SELECT json_build_object('grants', COUNT(*),
      'remaining', COALESCE(SUM(langpretation_minutes_remaining), 0),
      'used', COALESCE(SUM(langpretation_minutes_used), 0))
    FROM public.nanivio_subscriptions WHERE user_id = ${literal(userId)}
      AND left(subscription_id, 11) = 'comm_grant_';`));

  // Hold the exact advisory lock used by both RPCs. Prove independent workers
  // are waiting for it before releasing them; this is not just Promise.all timing.
  async function race(userId, operations) {
    const name = `${prefix}_race`;
    const blocker = db.start();
    const marker = new Promise((resolve, reject) => {
      let output = '';
      blocker.child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('LOCK_READY')) resolve();
      });
      blocker.result.then(() => reject(new Error('Lock session ended before ready')), reject);
    });
    blocker.child.stdin.write(`SELECT pg_advisory_lock(hashtext(${literal(`nanivio-entitlements:${userId}`)}));\nSELECT 'LOCK_READY';\n`);
    let work;
    try {
      await marker;
      // Attach rejection handlers immediately so an expected insufficient-quota
      // result cannot become an unhandled promise rejection.
      work = Promise.allSettled(operations.map((op) => op({ PGAPPNAME: name })));
      let waiting = 0;
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        // Supabase's session pooler may discard startup application_name.
        // A query comment survives pooling and identifies only these workers.
        waiting = Number(await db.query(`SELECT COUNT(*) FROM pg_stat_activity
          WHERE position(${literal(`/* ${name} */`)} IN query) > 0
            AND pid <> pg_backend_pid() AND wait_event = 'advisory';`));
        if (waiting === operations.length) break;
        await delay(100);
      }
      assert.equal(waiting, operations.length, 'Every independent RPC must contend on the entitlement lock');
    } finally {
      blocker.child.stdin.end(`SELECT pg_advisory_unlock(hashtext(${literal(`nanivio-entitlements:${userId}`)}));\n`);
      await blocker.result;
      // Always settle all workers before cleanup, including when the barrier fails.
      if (work) await work;
    }
    return work;
  }
  const successful = (results) => {
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    return results.map((result) => result.value);
  };
  async function noFinancialSideEffects() {
    const counts = JSON.parse(await db.query(`SELECT json_build_array(
      (SELECT COUNT(*) FROM public.nanivio_wallet_ledger WHERE user_id IN (${userList})),
      (SELECT COUNT(*) FROM public.nanivio_credit_ledger WHERE user_id IN (${userList})),
      (SELECT COUNT(*) FROM public.nanivio_invoices WHERE user_id IN (${userList})),
      (SELECT COUNT(*) FROM public.nanivio_payments WHERE user_id IN (${userList})),
      (SELECT COUNT(*) FROM public.nanivio_billing_transactions WHERE user_id IN (${userList})),
      (SELECT COUNT(*) FROM public.nanivio_credit_accounts WHERE user_id IN (${userList})));`));
    assert.deepEqual(counts, [0, 0, 0, 0, 0, 0], 'No debit, payment confirmation, invoice, transaction or credit account');
  }

  try {
    await db.query(`INSERT INTO public.nanivio_wallets
      (user_id, account_type, currency, available, reserved, promotional, version)
      VALUES (${literal(selectionUser)}, 'COMMUNICATION', 'GHS', 250, 3, 2, 7);`);
    const walletBefore = await db.query(`SELECT row_to_json(w) FROM public.nanivio_wallets w
      WHERE user_id = ${literal(selectionUser)};`);
    const selections = successful(await race(selectionUser,
      Array.from({ length: 4 }, () => (env) => select(selectionUser, 100, env))));
    assert.equal(selections.filter((value) => value.granted).length, 1);
    assert.equal(new Set(selections.map((value) => value.subscription.id)).size, 1);
    assert.deepEqual(await state(selectionUser), { grants: 1, remaining: 100, used: 0 });
    assert.equal(await db.query(`SELECT row_to_json(w) FROM public.nanivio_wallets w
      WHERE user_id = ${literal(selectionUser)};`), walletBefore, 'Existing wallet must be byte-for-byte unchanged');
    await noFinancialSideEffects();
    console.log('PASS: concurrent selections persist one grant, preserve a funded wallet and create no financial records');

    await select(mixedUser, 100);
    successful(await race(mixedUser, [
      (env) => select(mixedUser, 200, env),
      (env) => use(mixedUser, `${prefix}_mixed_1`, env),
      (env) => select(mixedUser, 100, env),
      (env) => use(mixedUser, `${prefix}_mixed_2`, env),
    ]));
    await select(mixedUser, 100);
    assert.deepEqual(await state(mixedUser), { grants: 1, remaining: 98, used: 2 });
    console.log('PASS: concurrent selection and usage preserve consumption across tier changes');

    await select(boundaryUser, 100);
    // Match the server route's stable call/user/session/boundary key. Replaying a
    // partially completed meter update must not consume the first boundary twice.
    const event = (boundary) => `call_usage_${boundaryUser}_${prefix}_call_${boundary}`;
    await use(boundaryUser, event(1));
    const retries = successful(await race(boundaryUser, [
      (env) => use(boundaryUser, event(1), env),
      (env) => use(boundaryUser, event(2), env),
      (env) => use(boundaryUser, event(2), env),
      (env) => use(boundaryUser, event(1), env),
    ]));
    assert.equal(retries.filter((value) => !value.duplicate).length, 1);
    assert.deepEqual(await state(boundaryUser), { grants: 1, remaining: 98, used: 2 });
    // A new client process simulates losing the HTTP response after commit.
    assert.equal((await use(boundaryUser, event(2))).duplicate, true);
    assert.equal(Number(await db.query(`SELECT COUNT(*) FROM public.nanivio_usage_events
      WHERE user_id = ${literal(boundaryUser)};`)), 2);
    console.log('PASS: minute-boundary retries across independent connections deduct once per boundary');

    await select(exhaustionUser, 1);
    const exhausted = await race(exhaustionUser, [
      (env) => use(exhaustionUser, `${prefix}_last_1`, env),
      (env) => use(exhaustionUser, `${prefix}_last_2`, env),
    ]);
    assert.equal(exhausted.filter((value) => value.status === 'fulfilled').length, 1);
    const rejected = exhausted.filter((value) => value.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason.message, /Insufficient Langpretation allowance/);
    assert.deepEqual(await state(exhaustionUser), { grants: 1, remaining: 0, used: 1 });
    assert.equal(Number(await db.query(`SELECT COUNT(*) FROM public.nanivio_usage_events
      WHERE user_id = ${literal(exhaustionUser)};`)), 1);
    await noFinancialSideEffects();
    assert.equal(Number(await db.query(`SELECT COUNT(*) FROM public.nanivio_wallets
      WHERE user_id IN (${userList});`)), 1, 'No additional wallets created');
    console.log('PASS: concurrent usage cannot overspend the last minute or leave failed events');
  } finally {
    // Exact UUID-scoped users only. Never clear a table or match real account IDs.
    await db.query(`BEGIN;
      DELETE FROM public.nanivio_usage_events WHERE user_id IN (${userList});
      DELETE FROM public.nanivio_billing_audit_logs WHERE actor_user_id IN (${userList});
      DELETE FROM public.nanivio_subscriptions WHERE user_id IN (${userList});
      DELETE FROM public.nanivio_wallets WHERE user_id IN (${userList});
      COMMIT;`);
    console.log('Cleaned up committed concurrency fixtures');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // This entry point is local-only. Staging must use the guarded runner.
  if (!process.env.PGHOST?.startsWith('/tmp/nanivio-regressions.')) {
    throw new Error('Use the isolated PostgreSQL runner or the guarded staging runner.');
  }
  await verifyCommunicationConcurrency(process.env);
}
