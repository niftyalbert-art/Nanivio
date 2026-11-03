import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { CommunicationCallMeter } from '../src/server/communicationAccess.ts';

test('persistent communication policy, reservations, ownership and paid benefits', async t => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nanivio_subscriptions(subscription_id text primary key,user_id text,tier text,status text,
      current_period_start timestamptz default now(),current_period_end timestamptz default now()+interval '30 days',
      created_at timestamptz default now(),voice_minutes_quota numeric default 10,voice_minutes_used numeric default 0,
      langpretation_minutes_quota numeric default 10,langpretation_minutes_used numeric default 0,langpretation_minutes_remaining numeric default 10);
    CREATE TABLE nanivio_billing_audit_logs(actor_user_id text,action text,entity_type text,entity_id text,metadata jsonb);`);
  await db.exec(await readFile('migrations/021_communication_access_policy.sql','utf8'));
  const run = async (action:string,payload:any={})=>(await db.query<any>('SELECT nanivio_communication_access($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result;
  const paid = async (id:string)=>db.query("INSERT INTO nanivio_subscriptions(subscription_id,user_id,tier,status) VALUES($1,$2,'individual_premium','ACTIVE')",[`sub_${id}`,id]);
  const reserve = (id:string,kind:string,amount:number,eventId:string)=>run('RESERVE',{userId:id,resource:kind,amount,eventId});
  try {
    await t.test('sign-in/read-only access and unanswered calls never start the trial',async()=>{
      const access=await run('ACCESS',{userId:'new'});
      assert.equal(access.trialStartedAt,null);assert.equal(access.callSecondsRemaining,null);
      assert.equal((await reserve('new','call',5,'not-connected')).success,false);
      assert.equal((await run('ACCESS',{userId:'new'})).trialStartedAt,null);
    });
    await t.test('first connected call starts exactly one 30-day period',async()=>{
      const first=await run('CONNECT',{userId:'new'}),second=await run('CONNECT',{userId:'new'});
      assert.equal(first.trialStartedAt,second.trialStartedAt);
      assert.equal(Date.parse(first.trialEndsAt)-Date.parse(first.trialStartedAt),30*86400000);
      assert.equal((await reserve('new','call',5,'free-call')).source,'call_trial');
      await run('COMMIT',{userId:'new',eventId:'free-call',used:2});
      assert.equal((await run('ACCESS',{userId:'new'})).trialEndsAt,first.trialEndsAt);
    });
    await t.test('expired ordinary trial requires caller subscription, not a wallet balance',async()=>{
      await db.exec("UPDATE nanivio_communication_accounts SET trial_ends_at=now()-interval '1 second' WHERE user_id='new'");
      assert.equal((await reserve('new','call',5,'expired')).success,false);
      await paid('new');
      assert.equal((await reserve('new','call',5,'paid-call')).source,'subscription');
      assert.equal(Number((await db.query<any>("SELECT voice_minutes_used FROM nanivio_subscriptions WHERE user_id='new'")).rows[0].voice_minutes_used),5/60);
    });
    await t.test('free monthly language grants cannot unlock paid chat translation',async()=>{
      await db.exec("INSERT INTO nanivio_subscriptions(subscription_id,user_id,tier,status) VALUES('sub_free','free','free','TRIAL')");
      assert.equal((await reserve('free','text',5,'free-text')).success,false);
      assert.equal((await reserve('free','note',5,'free-note')).success,false);
      assert.equal((await reserve('free','live',5,'free-live')).source,'live_trial');
    });
    await t.test('live trial is one-time and caption/audio use one shared reservation',async()=>{
      const live=await reserve('live','live',180,'live-all');
      assert.equal(live.amount,180);
      await run('COMMIT',{userId:'live',eventId:'live-all'});
      assert.equal((await reserve('live','live',1,'live-exhausted')).success,false);
      assert.equal((await run('ACCESS',{userId:'live'})).liveTrialSecondsRemaining,0);
    });
    await t.test('paid text counts characters separately from speech minutes and deduplicates',async()=>{
      await paid('text');
      assert.equal((await reserve('text','text',100,'text-one')).success,true);
      await run('COMMIT',{userId:'text',eventId:'text-one'});
      assert.equal((await reserve('text','text',100,'text-one')).alreadyReserved,true);
      const access=await run('ACCESS',{userId:'text'});
      assert.equal(access.textCharactersRemaining,19900);assert.equal(access.translatedSecondsRemaining,600);
      await assert.rejects(()=>reserve('other','text',100,'text-one'),/owner mismatch/);
      await assert.rejects(()=>reserve('text','text',101,'text-one'),/does not match/);
    });
    await t.test('failed provider jobs refund once; released reservations cannot deliver as paid',async()=>{
      await paid('refund');
      await reserve('refund','note',30,'note-refund');
      assert.equal((await run('ACCESS',{userId:'refund'})).translatedSecondsRemaining,570);
      await run('RELEASE',{userId:'refund',eventId:'note-refund'});
      await run('RELEASE',{userId:'refund',eventId:'note-refund'});
      assert.equal((await run('ACCESS',{userId:'refund'})).translatedSecondsRemaining,600);
      assert.equal((await run('COMMIT',{userId:'refund',eventId:'note-refund'})).success,false);
    });
    await t.test('partial call settlement refunds unused reserved seconds without a refill',async()=>{
      await run('COMMIT',{userId:'new',eventId:'paid-call',used:2});
      await run('COMMIT',{userId:'new',eventId:'paid-call',used:2});
      const access=await run('ACCESS',{userId:'new'});
      assert.ok(Math.abs(access.sharedCallMinutes-(10-2/60))<0.000001);
    });
    await t.test('concurrent requests cannot overspend a shared paid speech quota',async()=>{
      await paid('parallel');
      await db.exec("UPDATE nanivio_subscriptions SET langpretation_minutes_remaining=0.1 WHERE user_id='parallel'");
      const results=await Promise.all([reserve('parallel','note',5,'parallel-a'),reserve('parallel','note',5,'parallel-b')]);
      assert.equal(results.filter(result=>result.success).length,1);
    });
    await t.test('admin changes are audited and do not refill existing trials or paid text terms',async()=>{
      const config=(await run('POLICY')).config;
      await run('SAVE_POLICY',{userId:'admin',config:{...config,callTrialDays:60,liveTrialMinutes:10,paidTextCharacters:30000}});
      assert.equal((await run('ACCESS',{userId:'live'})).liveTrialSecondsRemaining,0);
      assert.equal((await run('ACCESS',{userId:'text'})).textCharactersRemaining,19900);
      await paid('future');assert.equal((await run('ACCESS',{userId:'future'})).textCharactersRemaining,30000);
      assert.equal((await db.query<any>('SELECT count(*) FROM nanivio_billing_audit_logs')).rows[0].count,1);
    });
    await t.test('admin credits/debits affect only the active paid term and retries are idempotent',async()=>{
      const payload={userId:'new',actorId:'admin',resource:'call',delta:5,reason:'Customer service adjustment',requestId:'00d6c42c-7d49-4a65-950c-01fbc58e9927'};
      const before=await run('ACCESS',{userId:'new'});
      await run('ADMIN_ADJUST',payload);
      assert.equal((await run('ADMIN_ADJUST',payload)).alreadyApplied,true);
      const after=await run('ACCESS',{userId:'new'});
      assert.ok(Math.abs(after.sharedCallMinutes-before.sharedCallMinutes-5)<0.000001);
      assert.equal(after.paidUntil,before.paidUntil);
      assert.equal(after.trialEndsAt,before.trialEndsAt);
      await assert.rejects(()=>run('ADMIN_ADJUST',{...payload,delta:6}),/retry does not match/);
      await assert.rejects(()=>run('ADMIN_ADJUST',{...payload,delta:-100,requestId:'00d6c42c-7d49-4a65-950c-01fbc58e9928'}),/Cannot remove/);
      assert.equal((await run('ADMIN_ADJUST',{...payload,userId:'free',requestId:'00d6c42c-7d49-4a65-950c-01fbc58e9929'})).success,false);
    });
    await t.test('ordinary Supabase users cannot call the billing RPC or read another account',async()=>{
      await db.exec('SET ROLE authenticated');
      try{
        await assert.rejects(()=>run('ADMIN_ADJUST',{userId:'new'}),/permission denied/);
        await assert.rejects(()=>db.query('SELECT * FROM nanivio_communication_accounts'),/permission denied/);
      }finally{await db.exec('RESET ROLE');}
    });
  } finally { await db.close(); }
});

test('competing sponsors cannot reserve both participants allowances',async()=>{
  let finish!:()=>void;
  const waiting=new Promise<void>(resolve=>{finish=resolve;});
  const live:string[]=[],released:string[]=[];
  const service:any={
    mayCall:async()=>({}),connected:async()=>({}),
    access:async()=>({policy:{warningSeconds:60},callSecondsRemaining:null,liveTrialSecondsRemaining:180,translatedSecondsRemaining:600}),
    reserve:async(userId:string,resource:string,amount:number)=>{
      if(resource==='live'){live.push(userId);await waiting;}
      return {userId,resource,amount,eventId:resource};
    },commit:async()=>{},release:async(r:any)=>{released.push(r.userId);},
  };
  const meter=new CommunicationCallMeter({end:assert.fail,state:()=>{},stopTranslation:()=>{}},service);
  meter.add('race','a',['a','b']);
  await meter.mediaReady('race','a');await meter.mediaReady('race','b');
  const first=meter.sponsor('race','a',true);
  await assert.rejects(()=>meter.sponsor('race','b',true),/already being processed/);
  finish();await first;
  assert.deepEqual(live,['a']);
  await meter.close('race');
  assert.deepEqual(released,['a']); // pending provider setup never consumed trial
});

test('exhausted translation stops both translation streams but ordinary paid calling continues',async()=>{
  const states:any[]=[],base:any[]=[];
  let exhausted=false,stopped=0;
  const service:any={
    mayCall:async()=>({}),connected:async()=>({}),
    access:async()=>({policy:{warningSeconds:60},callSecondsRemaining:null,liveTrialSecondsRemaining:0,translatedSecondsRemaining:0}),
    reserve:async(userId:string,resource:string)=>{
      if(resource==='live'&&exhausted)throw new Error('No translation minutes');
      if(resource==='call')base.push(userId);
      return {userId,resource,amount:0.01,eventId:`${resource}_${base.length}`};
    },commit:async()=>{},release:async()=>{},
  };
  const meter=new CommunicationCallMeter({end:assert.fail,state:(_id,state)=>states.push(state),stopTranslation:()=>{stopped++;}},service);
  meter.add('ongoing','a',['a','b']);
  await meter.mediaReady('ongoing','a');await meter.mediaReady('ongoing','b');
  await meter.sponsor('ongoing','a',true);meter.translationReady('ongoing');exhausted=true;
  await new Promise(resolve=>setTimeout(resolve,70));
  assert.ok(base.length>=2);assert.equal(stopped,1);
  assert.ok(states.some(state=>state.enabled===false&&state.subscriptionRequired));
  await meter.close('ongoing');
});

test('server call metering starts only after both media acknowledgements and never bills recipient',async()=>{
  const accounts:string[]=[],reservations:any[]=[];
  const service:any={
    mayCall:async()=>({}),connected:async(id:string)=>{accounts.push(id);},
    access:async()=>({policy:{warningSeconds:60},callSecondsRemaining:null,liveTrialSecondsRemaining:180,translatedSecondsRemaining:600}),
    reserve:async(userId:string,resource:string,amount:number)=>{const record={userId,resource,amount,eventId:String(reservations.length)};reservations.push(record);return record;},
    commit:async()=>{},release:async()=>{},
  };
  const meter=new CommunicationCallMeter({end:assert.fail,state:()=>{},stopTranslation:()=>{}},service);
  meter.add('call','caller',['caller','recipient']);
  await meter.mediaReady('call','caller');assert.equal(accounts.length,0);
  await meter.mediaReady('call','recipient');
  assert.equal(reservations.filter(row=>row.resource==='call'&&row.userId==='recipient').length,0);
  assert.equal(reservations.filter(row=>row.resource==='call'&&row.userId==='caller').length,1);
  await meter.sponsor('call','recipient',true);
  meter.authorize('call','caller');meter.authorize('call','recipient');
  assert.equal(reservations.filter(row=>row.resource==='live').length,1);
  assert.equal(reservations.find(row=>row.resource==='live').userId,'recipient');
  await meter.close('call');
});
