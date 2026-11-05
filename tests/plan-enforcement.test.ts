import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pricingPurchaseSnapshot } from '../src/lib/subscriptionPricing.ts';
import { meteredWebResearch } from '../src/server/planEnforcement.ts';

test('real PostgreSQL plan enforcement preserves terms and enforces storage/search atomically', async t => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_balanced_terms(user_id text,family text,snapshot jsonb,started_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days');
    CREATE TABLE nanivio_subscriptions(user_id text,tier text,status text,current_period_start timestamptz,current_period_end timestamptz);
    CREATE TABLE nanivio_malvi_business_rooms(id text PRIMARY KEY,owner_id text,document jsonb);
    CREATE FUNCTION nanivio_refresh_balanced_terms(text) RETURNS void LANGUAGE sql AS 'SELECT';
    INSERT INTO nanivio_malvi_business_rooms VALUES('existing','owner','{"meetingOpen":true,"knowledge":["Existing customer document"]}');
  `);
  await db.exec(await readFile('migrations/024_balanced_pricing_ledger.sql','utf8'));
  await db.exec(await readFile('migrations/026_plan_enforcement.sql','utf8'));
  const run = async (name: string, action: string, payload: any) =>
    (await db.query<any>(`SELECT ${name}($1,$2::jsonb) AS value`,[action,JSON.stringify(payload)])).rows[0].value;
  const storage = (action: string, payload: any) => run('nanivio_plan_storage',action,payload);
  const search = (action: string, payload: any) => run('nanivio_paid_search',action,payload);
  async function grant(userId: string, id: string, custom?: any) {
    const snapshot = custom || pricingPurchaseSnapshot(id);
    await run('nanivio_balanced_usage','GRANT',{userId,grantId:`grant:${userId}`,reference:`paid:${userId}`,snapshot});
    await db.query(`INSERT INTO nanivio_balanced_terms(user_id,family,snapshot) VALUES($1,$2,$3::jsonb)`,[userId,snapshot.family,JSON.stringify(snapshot)]);
  }
  try {
    await t.test('existing workspace documents are inventoried without modifying their content',async()=>{
      const original=(await storage('ACCESS',{userId:'owner'})).usedBytes;
      assert.ok(original>0);
      assert.equal((await db.query<any>('SELECT document FROM nanivio_malvi_business_rooms')).rows[0].document.knowledge[0],'Existing customer document');
    });
    await t.test('free chat storage stays available; exact full capacity prevents new uploads',async()=>{
      assert.equal((await storage('ACCESS',{userId:'free'})).capacityBytes,2e9);
      await storage('RESERVE',{userId:'free',objectId:'file1',sizeBytes:2e9,channelId:'chat',fileName:'recording.webm'});
      assert.equal((await storage('RESERVE',{userId:'free',objectId:'file2',sizeBytes:1})).code,'STORAGE_QUOTA_EXCEEDED');
      await storage('COMPLETE',{userId:'free',objectId:'file1',url:'https://cdn.example.test/file'});
      await assert.rejects(storage('DELETE',{userId:'intruder',objectId:'file1'}),/another owner/);
      assert.equal((await storage('ACCESS',{userId:'free'})).usedBytes,2e9);
      await storage('DELETE',{userId:'free',objectId:'file1'});
      assert.equal((await storage('ACCESS',{userId:'free'})).usedBytes,0);
    });
    await t.test('legacy paid storage stays at its old benefit until expiry',async()=>{
      await db.exec(`INSERT INTO nanivio_subscriptions VALUES('legacy','individual_premium','ACTIVE',now()-interval '1 day',now()+interval '1 day')`);
      assert.equal((await storage('ACCESS',{userId:'legacy'})).capacityBytes,null);
      assert.equal((await storage('ACCESS',{userId:'legacy'})).legacyPaidTerm,true);
      await db.exec(`UPDATE nanivio_subscriptions SET current_period_end=now()-interval '1 second' WHERE user_id='legacy'`);
      assert.equal((await storage('ACCESS',{userId:'legacy'})).capacityBytes,2e9);
    });
    await t.test('new purchased storage snapshot, not mutable catalogue, sets capacity; expiry never erases occupancy',async()=>{
      const snapshot=pricingPurchaseSnapshot('plan_individual_premium');
      snapshot.limits.storageBytes=100;
      await grant('small','plan_individual_premium',snapshot);
      await storage('RESERVE',{userId:'small',objectId:'s1',sizeBytes:50});
      await db.exec(`UPDATE nanivio_balanced_terms SET started_at=now()-interval '1 day',expires_at=now()+interval '60 days' WHERE user_id='small'`);
      assert.equal((await storage('ACCESS',{userId:'small'})).usedBytes,50);
      assert.equal((await storage('ACCESS',{userId:'small'})).capacityBytes,100);
      await assert.rejects(storage('RESERVE',{userId:'small',objectId:'s1',sizeBytes:50}),/already used/);
    });
    await t.test('workspace storage checks are in the same transaction as the actual saved document',async()=>{
      await db.exec(`INSERT INTO nanivio_malvi_business_rooms VALUES('shared','small','{"meetingOpen":false}')`);
      const before=await storage('ACCESS',{userId:'small'});
      await assert.rejects(db.query(`UPDATE nanivio_malvi_business_rooms SET document=jsonb_build_object('knowledge',$1::text) WHERE id='shared'`,['x'.repeat(200)]),/STORAGE_QUOTA_EXCEEDED/);
      assert.equal((await storage('ACCESS',{userId:'small'})).usedBytes,before.usedBytes);
      await assert.rejects(db.exec(`UPDATE nanivio_malvi_business_rooms SET owner_id='intruder' WHERE id='shared'`),/ownership cannot change/);
    });
    await t.test('new search reserves fan-out and returns unused queries, with owner-bound idempotent settlement',async()=>{
      await grant('premium','malvi_premium');
      assert.equal((await search('RESERVE',{userId:'premium',eventId:'q1'})).reserved,4);
      assert.equal((await search('ACCESS',{userId:'premium'})).remaining.searchQueries,16);
      await assert.rejects(search('SETTLE',{userId:'intruder',eventId:'q1',providerQueries:0}),/another owner/);
      assert.equal((await search('SETTLE',{userId:'premium',eventId:'q1',providerQueries:2})).chargedQueries,2);
      await search('SETTLE',{userId:'premium',eventId:'q1',providerQueries:0});
      assert.equal((await search('ACCESS',{userId:'premium'})).remaining.searchQueries,18);
    });
    await t.test('timeouts retain bounded reservations and excess provider queries never overcharge the customer',async()=>{
      await search('RESERVE',{userId:'premium',eventId:'timeout'});
      assert.equal((await search('SETTLE',{userId:'premium',eventId:'timeout'})).chargedQueries,4);
      await search('RESERVE',{userId:'premium',eventId:'fanout'});
      const result=await search('SETTLE',{userId:'premium',eventId:'fanout',providerQueries:9});
      assert.equal(result.chargedQueries,4);assert.equal(result.providerQueries,9);
    });
    await t.test('exhausted search is stopped before dispatch while old paid terms keep their established safety limits',async()=>{
      for(let i=0;i<3;i++) await search('RESERVE',{userId:'premium',eventId:`consume${i}`});
      assert.equal((await search('RESERVE',{userId:'premium',eventId:'blocked'})).code,'SEARCH_ALLOWANCE_EXHAUSTED');
      assert.equal((await search('RESERVE',{userId:'legacy-malvi',eventId:'legacy-query'})).legacy,true);
      assert.equal((await search('SETTLE',{userId:'legacy-malvi',eventId:'legacy-query',providerQueries:2})).chargedQueries,0);
    });
    await t.test('migration is repeatable without refilling allowances or losing file records',async()=>{
      await db.exec(await readFile('migrations/026_plan_enforcement.sql','utf8'));
      assert.equal((await storage('ACCESS',{userId:'small'})).capacityBytes,100);
      assert.equal((await search('RESERVE',{userId:'premium',eventId:'still-blocked'})).success,false);
    });
  } finally { await db.close(); }
});

test('provider dispatch cannot precede search reservation and failures do not refund uncertain work',async()=>{
  const actions:string[]=[];
  const command:any=async (_name:string,action:string,payload:any)=>{
    actions.push(action); return {success:true,reserved:4,chargedQueries:payload.providerQueries??4,legacy:false};
  };
  const answer=await meteredWebResearch('owner',async()=>{actions.push('PROVIDER');return {providerQueryCount:2};},r=>r.providerQueryCount,command);
  assert.deepEqual(actions,['RESERVE','PROVIDER','SETTLE']);
  assert.equal(answer.paidSearchUsage.chargedQueries,2);
  actions.length=0;
  await assert.rejects(meteredWebResearch('owner',async()=>{actions.push('PROVIDER');throw Error('timeout');},()=>0,command),/timeout/);
  assert.deepEqual(actions,['RESERVE','PROVIDER','SETTLE']);
  let dispatched=false;
  await assert.rejects(meteredWebResearch('owner',async()=>{dispatched=true;return {};},()=>0,async()=>{throw Error('quota');}),/quota/);
  assert.equal(dispatched,false);
});
