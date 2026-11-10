import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {AccountDeletionWorker,DELETION_STEPS,type DeletionAdapter,type DeletionWorkStore} from '../src/server/accountDeletionWorker';
import {identityDeletionAdapter,localDeletionAdapter,streamDeletionAdapter,voiceDeletionAdapter} from '../src/server/accountDeletionAdapters';
import {AccountAccessAuthority} from '../src/server/accountAccessAuthority';

const db=new PGlite();
const request='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const token='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const policy={executionApproved:true,version:'isolated-fixture-only',
  legalReview:'fixture-legal',retentionSchedule:'fixture-tax-records',
  sharedContentReview:'fixture-shared-pruning',billingSettlement:'fixture-settlement',
  storageInventory:'fixture-inventory',backupReview:'fixture-backups',providerInventory:'fixture-providers'};
const calls:string[]=[];
const store:DeletionWorkStore={
  async command(id,operation,lease,step,payload={}) {
    calls.push(operation+':'+(step||''));
    const result=await db.query<{result:any}>('SELECT nanivio_deletion_work($1,$2,$3,$4,$5) result',
      [id,operation,lease||null,step||null,JSON.stringify(payload)]);
    return result.rows[0].result;
  },
};
const query=async(sql:string,values:any[]=[])=>db.query<any>(sql,values);
before(async()=>{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  // Exercise the actual profile definition and identity-column migration,
  // rather than assuming that a reduced fixture matches production columns.
  const schema=await readFile('supabase/schema.sql','utf8');
  await db.exec(schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS public.nanivio_users'),
    schema.indexOf('-- 2. Subscriptions')));
  const identity=await readFile('migrations/003_production_auth_and_app_data.sql','utf8');
  await db.exec(identity.slice(0,identity.indexOf('CREATE TABLE IF NOT EXISTS public.nanivio_user_applications')));
  await db.exec(`
    CREATE TABLE nanivio_contacts(id text PRIMARY KEY,user_id text REFERENCES nanivio_users(id) ON DELETE CASCADE,payload jsonb);
    CREATE TABLE nanivio_malvi_messages(id text PRIMARY KEY,user_id text REFERENCES nanivio_users(id) ON DELETE CASCADE,text text);
    CREATE TABLE nanivio_invoices(id text PRIMARY KEY,user_id text REFERENCES nanivio_users(id) ON DELETE CASCADE,amount numeric);
    CREATE TABLE fixture_shared_replies(id text PRIMARY KEY,owner_id text,text text);`);
  await db.exec(await readFile('migrations/029_account_deletion_requests.sql','utf8'));
  await db.exec(await readFile('migrations/030_account_deletion_fulfillment.sql','utf8'));
  await db.exec(await readFile('migrations/031_account_deletion_local_cleanup.sql','utf8'));
});
after(()=>db.close());
beforeEach(async()=>{
  calls.length=0;
  await db.exec(`TRUNCATE nanivio_deletion_steps,nanivio_deletion_retention,nanivio_deletion_jobs,nanivio_deletion_requests,
    nanivio_contacts,nanivio_malvi_messages,nanivio_invoices,nanivio_users,fixture_shared_replies CASCADE;
    INSERT INTO nanivio_users(id,nv_id,name,email,phone,status,auth_user_id,avatar,first_name) VALUES
      ('owner-A','0000000001','A','a@example.test','fixture-phone-A','ACTIVE','11111111-1111-4111-8111-111111111111','private-avatar','A'),
      ('owner-B','0000000002','B','b@example.test','fixture-phone-B','ACTIVE','22222222-2222-4222-8222-222222222222',null,'B');
    INSERT INTO nanivio_contacts VALUES('a-contact','owner-A','{"name":"private"}'),('b-contact','owner-B','{"name":"keep"}');
    INSERT INTO nanivio_malvi_messages VALUES('a-memory','owner-A','private memory'),('b-memory','owner-B','keep memory');
    INSERT INTO nanivio_invoices VALUES('a-invoice','owner-A',42),('b-invoice','owner-B',17);
    INSERT INTO fixture_shared_replies VALUES('other-reply','owner-B','Keep the other participant reply');
    INSERT INTO nanivio_deletion_requests(id,owner_id) VALUES('${request}','owner-A');`);
});
const prepared=async()=>{
  await store.command(request,'PREPARE',undefined,undefined,policy);
  await query(`INSERT INTO nanivio_deletion_retention(request_id,resource_table,resource_key,basis,review_reference,relevant_date,retain_until)
    VALUES($1,'nanivio_invoices','{"id":"a-invoice"}','tax_ghana','fixture-accountant-review','2026-11-10','2032-11-10T00:00:00Z')
    ON CONFLICT DO NOTHING`,[request]);
};
function adapters() {
  const map:any=Object.fromEntries(DELETION_STEPS.map(step=>[step,{
    idempotent:true,run:async()=>({verified:true,receipt:{code:'FIXTURE_'+step.toUpperCase()}}),
  }]));
  map.access={idempotent:true,run:async({ownerId}:any)=>{
    await query("UPDATE nanivio_users SET status='DEACTIVATED' WHERE id=$1",[ownerId]);
    return {verified:true,receipt:{code:'FIXTURE_ACCESS_REVOKED'}};
  }};
  const fakeDb:any={rpc(_name:string,args:any){return {async abortSignal(){
    try{return {data:(await query('SELECT nanivio_deletion_clean_local($1,$2) result',[args.p_request,args.p_token])).rows[0].result,error:null};}
    catch{return {data:null,error:{message:'private fixture database detail'}};}
  }}}};
  map.personal_data=localDeletionAdapter(fakeDb);
  map.auth_identity={idempotent:true,run:async({ownerId}:any)=>{
    await query("UPDATE nanivio_users SET auth_user_id=null WHERE id=$1 AND status='DEACTIVATED'",[ownerId]);
    return {verified:true,receipt:{code:'FIXTURE_AUTH_REMOVED'}};
  }};
  map.verification={idempotent:true,run:async({ownerId}:any)=>{
    const row=(await query('SELECT * FROM nanivio_users WHERE id=$1',[ownerId])).rows[0];
    assert.equal(row.email,null);assert.equal(row.phone,null);assert.equal(row.avatar,null);
    assert.equal(row.name,'Deleted account');assert.equal(row.status,'DEACTIVATED');
    assert.equal(row.auth_user_id,null);assert.ok(row.erased_at);
    assert.equal((await query('SELECT count(*)::int n FROM nanivio_contacts WHERE user_id=$1',[ownerId])).rows[0].n,0);
    return {verified:true,receipt:{code:'FIXTURE_ALL_RESOURCES_VERIFIED'}};
  }};
  return map as Record<typeof DELETION_STEPS[number],DeletionAdapter>;
}
test('disabled or incompletely wired workers never touch storage or accounts',async()=>{
  assert.deepEqual(await new AccountDeletionWorker(store,adapters()).run(request),{state:'disabled'});
  assert.deepEqual(await new AccountDeletionWorker(store,{},true).run(request),{state:'unavailable'});
  assert.deepEqual(calls,[]);
  assert.equal((await query("SELECT status FROM nanivio_users WHERE id='owner-A'")).rows[0].status,'ACTIVE');
});
test('draft approval, missing references and mismatched prepared policy cannot authorize execution',async()=>{
  for(const invalid of [{...policy,executionApproved:false},{...policy,executionApproved:undefined},
    {...policy,legalReview:''},{...policy,retentionSchedule:null},{...policy,storageInventory:{secret:'invalid'}}]) {
    await assert.rejects(store.command(request,'PREPARE',undefined,undefined,invalid));
  }
  await prepared();
  await assert.rejects(store.command(request,'PREPARE',undefined,undefined,{...policy,version:'different'}),/immutable/);
  assert.equal((await query("SELECT status FROM nanivio_users WHERE id='owner-A'")).rows[0].status,'ACTIVE');
});
test('complete isolated cleanup preserves invoices, other accounts and other participants replies',async()=>{
  await prepared();
  assert.equal((await new AccountDeletionWorker(store,adapters(),true).run(request)).state,'completed');
  const receipt=(await query('SELECT status,completed_at FROM nanivio_deletion_requests')).rows[0];
  assert.equal(receipt.status,'completed');assert.ok(receipt.completed_at);
  assert.equal((await query('SELECT count(*)::int n FROM nanivio_invoices')).rows[0].n,2);
  assert.equal((await query("SELECT email FROM nanivio_users WHERE id='owner-B'")).rows[0].email,'b@example.test');
  assert.equal((await query("SELECT text FROM fixture_shared_replies WHERE id='other-reply'")).rows[0].text,'Keep the other participant reply');
  assert.equal((await query("SELECT text FROM nanivio_malvi_messages WHERE id='b-memory'")).rows[0].text,'keep memory');
  assert.equal((await new AccountDeletionWorker(store,adapters(),true).run(request)).state,'not_claimed');
});
test('claims are exclusive, owner comes from verified request, and stale workers cannot erase',async()=>{
  await prepared();
  const results=await Promise.all([store.command(request,'CLAIM',token),
    store.command(request,'CLAIM','cccccccc-cccc-4ccc-cccc-cccccccccccc')]);
  assert.equal(results.filter(result=>result.claimed).length,1);
  assert.equal(results.find(result=>result.claimed).ownerId,'owner-A');
  await assert.rejects(store.command(request,'START','dddddddd-dddd-4ddd-dddd-dddddddddddd','access'),/lease lost/);
  await assert.rejects(query('SELECT nanivio_deletion_clean_local($1,$2)',[request,'dddddddd-dddd-4ddd-dddd-dddddddddddd']),/lease lost/);
  await assert.rejects(store.command(request,'COMPLETE',token),/unverified/);
});
test('asynchronous Stream acceptance waits, resumes the same task, and does not resubmit',async()=>{
  await prepared();let starts=0,polls=0;
  const map=adapters();
  map.stream=streamDeletionAdapter({
    async startPruning(owner){assert.equal(owner,'owner-A');starts++;return {operationId:'fixture-task-1'};},
    async check(id,owner){assert.equal(id,'fixture-task-1');assert.equal(owner,'owner-A');polls++;return polls===1?'pending':'completed';},
  });
  const worker=new AccountDeletionWorker(store,map,true);
  assert.equal((await worker.run(request)).state,'waiting');
  assert.equal((await query('SELECT completed_at FROM nanivio_deletion_requests')).rows[0].completed_at,null);
  assert.equal((await worker.run(request)).state,'waiting');
  assert.equal((await worker.run(request)).state,'completed');
  assert.equal(starts,1);assert.equal(polls,2);
  assert.equal(calls.filter(c=>c==='START:access').length,1);
});
test('interrupted non-idempotent dispatch stops for reconciliation instead of repeating it',async()=>{
  await prepared();await store.command(request,'CLAIM',token);
  for(const step of DELETION_STEPS.slice(0,4)) {
    await store.command(request,'START',token,step);
    await store.command(request,'VERIFY',token,step,{code:'FIXTURE_VERIFIED'});
  }
  await store.command(request,'START',token,'stream');
  await query("UPDATE nanivio_deletion_jobs SET lease_until=now()-interval '1 second'");
  let dispatches=0;const map=adapters();
  map.stream={idempotent:false,run:async()=>{dispatches++;throw Error('must not run');}};
  const result=await new AccountDeletionWorker(store,map,true).run(request);
  assert.equal(result.state,'needs_attention');assert.equal((result as any).code,'PROVIDER_OUTCOME_UNCONFIRMED');
  assert.equal(dispatches,0);
});
test('provider failure leaves a durable safe status and verified steps survive an explicitly reviewed retry',async()=>{
  await prepared();let attempts=0;const map=adapters();
  map.voice={idempotent:true,run:async()=>{
    if(++attempts===1)throw Error('PRIVATE_API_KEY_AND_PROVIDER_RESPONSE');
    return {verified:true,receipt:{code:'VOICE_VERIFIED'}};
  }};
  const worker=new AccountDeletionWorker(store,map,true);
  assert.equal((await worker.run(request)).state,'needs_attention');
  assert.equal(JSON.stringify((await query('SELECT * FROM nanivio_deletion_jobs')).rows).includes('PRIVATE_API_KEY'),false);
  await assert.rejects(store.command(request,'RETRY'),/Reviewed retry/);
  await store.command(request,'RETRY',undefined,undefined,{reviewReference:'fixture-reviewed-retry'});
  assert.equal((await worker.run(request)).state,'completed');
  assert.equal(calls.filter(c=>c==='START:access').length,1);
});
test('unrecognized owned resources and profile columns block cleanup without partial local erasure',async()=>{
  await db.exec("CREATE TABLE nanivio_unknown_resource(owner_id text);INSERT INTO nanivio_unknown_resource VALUES('owner-A')");
  try {
    await prepared();
    assert.equal((await new AccountDeletionWorker(store,adapters(),true).run(request)).state,'needs_attention');
    assert.equal((await query("SELECT email FROM nanivio_users WHERE id='owner-A'")).rows[0].email,'a@example.test');
    assert.equal((await query("SELECT count(*)::int n FROM nanivio_contacts WHERE user_id='owner-A'")).rows[0].n,1);
  } finally {await db.exec('DROP TABLE nanivio_unknown_resource');}
  await db.exec('ALTER TABLE nanivio_users ADD COLUMN unknown_private_value text');
  try {
    await store.command(request,'RETRY',undefined,undefined,{reviewReference:'fixture-review'});
    assert.equal((await new AccountDeletionWorker(store,adapters(),true).run(request)).state,'needs_attention');
    assert.equal((await query("SELECT email FROM nanivio_users WHERE id='owner-A'")).rows[0].email,'a@example.test');
  } finally {await db.exec('ALTER TABLE nanivio_users DROP COLUMN unknown_private_value');}
});
test('late private writes and reactivation cannot resurrect an erased account',async()=>{
  await prepared();await new AccountDeletionWorker(store,adapters(),true).run(request);
  await assert.rejects(query("INSERT INTO nanivio_contacts VALUES('late','owner-A','{}')"),/not active/);
  await assert.rejects(query("INSERT INTO nanivio_malvi_messages VALUES('late','owner-A','private')"),/not active/);
  await assert.rejects(query("UPDATE nanivio_users SET status='ACTIVE' WHERE id='owner-A'"),/cannot be (restored|reversed)/);
  await assert.rejects(query("UPDATE nanivio_users SET erased_at=null WHERE id='owner-A'"),/cannot be restored/);
});
test('ordinary suspended-account admin review is preserved, but an active erasure cannot be reversed',async()=>{
  await query("UPDATE nanivio_users SET status='SUSPENDED' WHERE id='owner-B'");
  await query("UPDATE nanivio_contacts SET payload='{\"reviewed\":true}' WHERE id='b-contact'");
  await prepared();await store.command(request,'CLAIM',token);
  await query("UPDATE nanivio_users SET status='DEACTIVATED' WHERE id='owner-A'");
  await assert.rejects(query("UPDATE nanivio_users SET status='ACTIVE' WHERE id='owner-A'"),/cannot be reversed/);
});
test('forged checkpoint claims alone cannot complete an unerased profile',async()=>{
  await prepared();await store.command(request,'CLAIM',token);
  for(const step of DELETION_STEPS) {
    await store.command(request,'START',token,step);
    await store.command(request,'VERIFY',token,step,{code:'FIXTURE_UNTRUSTWORTHY_RECEIPT'});
  }
  await assert.rejects(store.command(request,'COMPLETE',token),/must be frozen/);
  assert.equal((await query('SELECT completed_at FROM nanivio_deletion_requests')).rows[0].completed_at,null);
});
test('missing or expired retention evidence blocks erasure and a valid legal hold needs a future review date',async()=>{
  await prepared();
  await query('DELETE FROM nanivio_deletion_retention');
  const worker=new AccountDeletionWorker(store,adapters(),true);
  assert.equal((await worker.run(request)).state,'needs_attention');
  assert.equal((await query("SELECT email FROM nanivio_users WHERE id='owner-A'")).rows[0].email,'a@example.test');
  await query(`INSERT INTO nanivio_deletion_retention VALUES($1,'nanivio_invoices','{"id":"a-invoice"}',
    'tax_ghana','fixture-review','2000-01-01','2006-01-01T00:00:00Z','fixture-active-appeal',now()-interval '1 day')`,[request]);
  await store.command(request,'RETRY',undefined,undefined,{reviewReference:'fixture-review'});
  assert.equal((await worker.run(request)).state,'needs_attention');
  await query("UPDATE nanivio_deletion_retention SET hold_review_at=now()+interval '1 day'");
  await store.command(request,'RETRY',undefined,undefined,{reviewReference:'fixture-renewed-review'});
  assert.equal((await worker.run(request)).state,'completed');
});
test('erased profiles reject new personal fields while allowing necessary financial reconciliation',async()=>{
  await prepared();await new AccountDeletionWorker(store,adapters(),true).run(request);
  await assert.rejects(query("UPDATE nanivio_users SET email='restored@example.test' WHERE id='owner-A'"),/cannot be restored/);
  await query("UPDATE nanivio_users SET wallet_balance_ghs=5 WHERE id='owner-A'");
  assert.equal(Number((await query("SELECT wallet_balance_ghs FROM nanivio_users WHERE id='owner-A'")).rows[0].wallet_balance_ghs),5);
});
test('public and authenticated database roles cannot execute fulfillment or access receipts',async()=>{
  for(const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(query('SELECT * FROM nanivio_deletion_jobs'),/permission denied/);
      await assert.rejects(store.command(request,'PREPARE',undefined,undefined,policy),/permission denied/);
      await assert.rejects(query('SELECT nanivio_deletion_clean_local($1,$2)',[request,token]),/permission denied/);
    } finally {await db.exec('RESET ROLE');}
  }
});
test('voice cleanup never treats an uncertain or enabled voice as deleted',async()=>{
  for(const view of [
    {available:true,status:'attention',enabled:false},
    {available:true,status:'deleted',enabled:true},
    {available:false,status:'none',enabled:false},
  ]) {
    const adapter=voiceDeletionAdapter({delete:async()=>view} as any);
    await assert.rejects(adapter.run({ownerId:'owner-A'} as any),/REVIEW_REQUIRED/);
  }
  const adapter=voiceDeletionAdapter({delete:async()=>({available:true,status:'deleted',enabled:false})} as any);
  assert.equal((await adapter.run({ownerId:'owner-A'} as any)).verified,true);
});
test('account authority revokes multiple browser/native leases across instances and fails closed on outage',async()=>{
  let active=true,unavailable=false;const closed:string[]=[];
  const read=async(ids:string[])=>{if(unavailable)throw Error('fixture outage');return new Set(active?ids:[]);};
  const a=new AccountAccessAuthority(read,60000),b=new AccountAccessAuthority(read,60000);
  const leases=[a.watch('owner-A',()=>closed.push('browser')),a.watch('owner-A',()=>closed.push('native')),
    b.watch('owner-A',()=>closed.push('other-server'))];
  try {
    assert.equal(await leases[0].allowed(),true);
    active=false;await Promise.all([a.refresh(),b.refresh()]);
    assert.deepEqual(closed.sort(),['browser','native','other-server']);
    active=true;assert.equal(await leases[0].allowed(),false);
    const outage=a.watch('owner-B',()=>closed.push('outage'));
    unavailable=true;assert.equal(await outage.allowed(),false);outage.dispose();
    assert.ok(closed.includes('outage'));
  } finally {for(const lease of leases)lease.dispose();}
});
