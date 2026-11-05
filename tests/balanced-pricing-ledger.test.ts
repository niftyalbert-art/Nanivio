import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pricingPurchaseSnapshot, usageLimits } from '../src/lib/subscriptionPricing.ts';

test('staged balanced pricing ledger uses real PostgreSQL accounting', async t => {
  const db=new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(`CREATE TABLE legacy_subscription(id text,minutes integer,used integer);
    INSERT INTO legacy_subscription VALUES('paid-before-pricing',300,27);`);
  const migration=await readFile('migrations/024_balanced_pricing_ledger.sql','utf8');
  await db.exec(migration);
  await db.exec(migration); // Installation is repeatable, not an entitlement reset.
  const run=async(action:string,payload:any={})=>(await db.query<any>(
    'SELECT nanivio_balanced_usage($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result;
  const grant=(userId:string,productId:string,id=userId,cycle:'MONTHLY'|'ANNUAL'='MONTHLY')=>
    run('GRANT',{userId,grantId:`grant_${id}`,reference:`paid_${id}`,snapshot:pricingPurchaseSnapshot(productId,cycle)});
  const reserve=(userId:string,eventId:string,usage:any)=>run('RESERVE',{userId,eventId,usage});
  const access=(userId:string)=>run('ACCESS',{userId});
  try {
    await t.test('installation leaves old purchased benefits intact and grants nothing',async()=>{
      assert.deepEqual((await db.query('SELECT * FROM legacy_subscription')).rows,
        [{id:'paid-before-pricing',minutes:300,used:27}]);
      assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_pricing_grants')).rows[0].n,0);
      assert.equal((await reserve('unpaid','unpaid-call',{callSeconds:1})).success,false);
    });
    await t.test('payment replay cannot refill, change owners, change identity or reprice a snapshot',async()=>{
      await grant('replay','malvi_basic');
      await reserve('replay','replay-avatar',{avatarSeconds:60});
      await run('COMMIT',{userId:'replay',eventId:'replay-avatar'});
      assert.equal((await grant('replay','malvi_basic')).alreadyGranted,true);
      assert.equal((await access('replay')).remaining.avatarSeconds,840);
      await assert.rejects(()=>grant('other','malvi_basic','replay'),/conflicts/);
      await assert.rejects(()=>grant('replay','malvi_premium','replay'),/conflicts/);
      await assert.rejects(()=>run('GRANT',{userId:'replay',grantId:'different-id',reference:'paid_replay',
        snapshot:pricingPurchaseSnapshot('malvi_basic')}),/conflicts/);
    });
    await t.test('voice-only and avatar time are independent, never double-debited',async()=>{
      await grant('voice','malvi_basic');
      await reserve('voice','avatar-only',{avatarSeconds:90});
      await run('COMMIT',{userId:'voice',eventId:'avatar-only'});
      let remaining=(await access('voice')).remaining;
      assert.equal(remaining.avatarSeconds,810);
      assert.equal(remaining.voiceSeconds,1200);
      await reserve('voice','voice-only',{voiceSeconds:60});
      remaining=(await access('voice')).remaining;
      assert.equal(remaining.avatarSeconds,810);
      assert.equal(remaining.voiceSeconds,1140);
    });
    await t.test('text counts one completed operation plus characters, both caps enforced atomically',async()=>{
      const snapshot=pricingPurchaseSnapshot('text_300');
      snapshot.limits=usageLimits({textRequests:2,textCharacters:10});
      await run('GRANT',{userId:'text',grantId:'text',reference:'paid_text',snapshot});
      await reserve('text','text-first',{textRequests:1,textCharacters:7});
      await run('COMMIT',{userId:'text',eventId:'text-first'});
      const failed=await reserve('text','text-too-long',{textRequests:1,textCharacters:4});
      assert.equal(failed.resource,'textCharacters');
      assert.equal((await access('text')).remaining.textRequests,1);
      await reserve('text','text-last',{textRequests:1,textCharacters:1});
      await run('COMMIT',{userId:'text',eventId:'text-last'});
      assert.equal((await reserve('text','text-too-many',{textRequests:1,textCharacters:1})).resource,'textRequests');
      assert.equal((await access('text')).remaining.textCharacters,2);
    });
    await t.test('failed jobs refund once and cannot be committed or reused later',async()=>{
      await grant('refund','lang_10');
      await reserve('refund','refund-job',{translationUnits:12345});
      await run('RELEASE',{userId:'refund',eventId:'refund-job'});
      assert.equal((await run('RELEASE',{userId:'refund',eventId:'refund-job'})).alreadyFinalized,true);
      assert.equal((await access('refund')).remaining.translationUnits,800_000);
      assert.equal((await run('COMMIT',{userId:'refund',eventId:'refund-job'})).success,false);
      assert.equal((await reserve('refund','refund-job',{translationUnits:12345})).success,false);
    });
    await t.test('usage events are idempotent and account-bound',async()=>{
      await grant('events','call_100');
      await reserve('events','same-event',{callSeconds:60});
      assert.equal((await reserve('events','same-event',{callSeconds:60})).alreadyReserved,true);
      assert.equal((await access('events')).remaining.callSeconds,5940);
      await assert.rejects(()=>reserve('events','same-event',{callSeconds:61}),/conflicts/);
      await assert.rejects(()=>run('COMMIT',{userId:'other',eventId:'same-event'}),/not found/);
    });
    await t.test('concurrent operations cannot overspend a pooled grant',async()=>{
      const snapshot=pricingPurchaseSnapshot('malvi_business');
      snapshot.limits.avatarSeconds=10;
      await run('GRANT',{userId:'workspace-owner',grantId:'pool',reference:'paid_pool',snapshot});
      const results=await Promise.all([
        reserve('workspace-owner','seat-a',{avatarSeconds:7}),
        reserve('workspace-owner','seat-b',{avatarSeconds:7}),
      ]);
      assert.equal(results.filter(r=>r.success).length,1);
      assert.equal((await access('workspace-owner')).remaining.avatarSeconds,3);
      assert.equal((await reserve('unverified-seat','seat-c',{avatarSeconds:1})).success,false);
    });
    await t.test('an operation can use multiple paid pools but cannot touch another resource',async()=>{
      await grant('combined','call_100','combined-small');
      await grant('combined','call_500','combined-large');
      assert.equal((await reserve('combined','combined-call',{callSeconds:6100})).success,true);
      assert.equal((await access('combined')).remaining.callSeconds,29_900);
      assert.equal((await reserve('combined','no-translated-bonus',{translationUnits:1})).success,false);
    });
    await t.test('annual renewal changes allocation, not trial state or paid expiry, and old refunds stay in their old month',async()=>{
      await grant('annual','plan_individual_premium','annual','ANNUAL');
      await reserve('annual','old-month',{callSeconds:60});
      // Move to a new anchored allocation; old jobs expired at their old month
      // boundary, so their refunds must not increase the new month's limit.
      await db.exec(`UPDATE nanivio_pricing_grants SET started_at=now()-interval '1 month' WHERE grant_id='grant_annual';
        UPDATE nanivio_pricing_usage_events SET expires_at=now()-interval '1 second' WHERE event_id='old-month';`);
      const current=await access('annual');
      assert.equal(current.remaining.callSeconds,12_000);
      assert.equal((await run('COMMIT',{userId:'annual',eventId:'old-month'})).success,false);
      const rows=(await db.query<any>("SELECT allocation,used::text FROM nanivio_pricing_consumption WHERE grant_id='grant_annual'")).rows;
      assert.equal(rows[0].allocation,0);
      assert.equal(rows[0].used,'0');
      await reserve('annual','new-month',{callSeconds:10});
      assert.equal((await access('annual')).remaining.callSeconds,11_990);
      assert.equal((await db.query<any>("SELECT allocation FROM nanivio_pricing_consumption WHERE grant_id='grant_annual' AND used>0")).rows[0].allocation,1);
    });
    await t.test('SQL calendar allocations have exactly twelve anchor-clamped months',async()=>{
      const snapshot=pricingPurchaseSnapshot('malvi_business','ANNUAL');
      for (let i=0;i<12;i++) {
        const result=await db.query<any>(`SELECT * FROM nanivio_pricing_allocation($1::jsonb,'2028-01-31 12:00:00+00',
          ('2028-01-31 12:00:00'::timestamp+make_interval(months=>$2)) AT TIME ZONE 'UTC')`,[JSON.stringify(snapshot),i]);
        assert.equal(result.rows[0].allocation,i);
      }
      assert.equal((await db.query(`SELECT * FROM nanivio_pricing_allocation($1::jsonb,
        '2028-01-31 12:00:00+00','2029-01-31 12:00:00+00')`,[JSON.stringify(snapshot)])).rows.length,0);
      const feb=(await db.query<any>(`SELECT ends_at FROM nanivio_pricing_allocation($1::jsonb,
        '2028-01-31 12:00:00+00','2028-02-01 00:00:00+00')`,[JSON.stringify(snapshot)])).rows[0];
      assert.equal(new Date(feb.ends_at).toISOString(),'2028-02-29T12:00:00.000Z');
    });
    await t.test('storage remains occupied at monthly allocation boundaries and delete is idempotent',async()=>{
      const snapshot=pricingPurchaseSnapshot('plan_individual_premium','ANNUAL');
      snapshot.limits.storageBytes=100;
      await run('GRANT',{userId:'storage',grantId:'storage',reference:'paid_storage',snapshot});
      await run('STORAGE_PUT',{userId:'storage',objectId:'stored-file',sizeBytes:90});
      await db.exec("UPDATE nanivio_pricing_grants SET started_at=now()-interval '1 month' WHERE grant_id='storage'");
      assert.equal((await access('storage')).remaining.storageBytes,10);
      assert.equal((await run('STORAGE_PUT',{userId:'storage',objectId:'too-big',sizeBytes:11})).code,'STORAGE_QUOTA_EXCEEDED');
      assert.equal((await run('STORAGE_PUT',{userId:'storage',objectId:'stored-file',sizeBytes:95})).success,true);
      await assert.rejects(()=>run('STORAGE_DELETE',{userId:'intruder',objectId:'stored-file'}),/another account/);
      await run('STORAGE_DELETE',{userId:'storage',objectId:'stored-file'});
      await run('STORAGE_DELETE',{userId:'storage',objectId:'stored-file'});
      assert.equal((await access('storage')).remaining.storageBytes,100);
    });
    await t.test('expired packs add no allowance and existing unrelated purchases remain intact',async()=>{
      await grant('expired','call_100');
      await db.exec("UPDATE nanivio_pricing_grants SET started_at=now()-interval '31 days' WHERE grant_id='grant_expired'");
      assert.equal((await reserve('expired','expired-usage',{callSeconds:1})).success,false);
      assert.deepEqual((await db.query('SELECT * FROM legacy_subscription')).rows,
        [{id:'paid-before-pricing',minutes:300,used:27}]);
    });
    await t.test('invalid snapshots, quantities and arbitrary resources fail closed',async()=>{
      for (const limits of [{callSeconds:-1},{callSeconds:1.5},{other:1}]) {
        const snapshot=pricingPurchaseSnapshot('call_100');
        Object.assign(snapshot.limits,limits);
        await assert.rejects(()=>run('GRANT',{userId:'invalid',grantId:'invalid',reference:'invalid',snapshot}),/Invalid/);
      }
      await assert.rejects(()=>reserve('events','invalid-field',{other:1}),/Invalid/);
      await assert.rejects(()=>reserve('events','invalid-value',{callSeconds:0}),/Invalid/);
      await assert.rejects(()=>reserve('events','invalid-negative',{callSeconds:-1}),/Invalid/);
    });
    await t.test('ordinary clients cannot read grants, write counters or execute the private API',async()=>{
      await db.exec('SET ROLE authenticated');
      try {
        await assert.rejects(()=>db.query('SELECT * FROM nanivio_pricing_grants'),/permission denied/);
        await assert.rejects(()=>run('ACCESS',{userId:'replay'}),/permission denied/);
      } finally { await db.exec('RESET ROLE'); }
    });
  } finally { await db.close(); }
});
