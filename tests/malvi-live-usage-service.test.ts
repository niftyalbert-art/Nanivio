import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveAvatarService } from '../src/server/assistant/liveAvatarService.ts';
import type { AssistantSessionRecord } from '../src/server/assistant/redisStore.ts';
import { validateRuntimeLimits } from '../src/server/malviRuntimeLimits.ts';

function fixture(seconds = 25) {
  let now = 100000;
  const records = new Map<string, AssistantSessionRecord>();
  const events: string[] = [];
  let saves = 0;
  const store = {
    reserve: async () => { events.push('redis-reserve'); },
    save: async (r: AssistantSessionRecord) => { saves++; records.set(r.id,{...r}); },
    get: async (id: string) => records.get(id),
    release: async (r: AssistantSessionRecord) => { events.push('release'); records.delete(r.id); },
    claimStop: async (id: string) => records.get(id),
    touch: async (id: string) => records.get(id),
    due: async () => [...records.keys()],
  };
  const usage = {
    reserve: async (_user: string,_id: string,mode: string) => { events.push('quota-'+mode); return seconds; },
    confirm: async () => { events.push('confirm'); },
    finish: async (_id: string,cancel?: boolean) => { events.push(cancel ? 'refund-setup' : 'settle'); },
  };
  const providerCalls: {path:string;body:any}[] = [];
  const service = createLiveAvatarService({store:async () => store as any,usage,now:()=>now,uuid:()=> 'session-id',
    provider:async (path,body) => {
      providerCalls.push({path,body});
      return {session_id:'provider-id',session_token:'token'};
    },
  });
  return {service,store,usage,events,records,providerCalls,setTime:(t:number)=> {now=t;},getSaves:()=>saves};
}
test('allowance is reserved before provider work and caps the provider and both session deadlines', async () => {
  const f = fixture();
  const info = await f.service.create('owner','en','LITE');
  assert.deepEqual(f.events,['redis-reserve','quota-avatar']);
  assert.equal(f.providerCalls[0].body.max_session_duration,25);
  assert.equal(info.hardDeadline,125000);
  assert.equal(info.idleDeadline,125000);
  assert.equal(info.serverNow,100000);
  await f.service.stop('owner',info.id);
  assert.deepEqual(f.events.slice(-2),['settle','release']);
});
test('customer voice-only sessions consume voice allowance without any avatar provider request', async () => {
  const f = fixture();
  const info = await f.service.create('owner','en','VOICE_ONLY');
  assert.equal(info.mode,'VOICE_ONLY');
  assert.equal(f.providerCalls.length,0);
  assert.deepEqual(f.events,['redis-reserve','quota-voice']);
  await f.service.activity('owner',info.id);
  await f.service.activity('owner',info.id);
  assert.equal(f.events.filter(e => e==='confirm').length,1,'confirmation is throttled');
  f.setTime(106000);
  await f.service.activity('owner',info.id);
  assert.equal(f.events.filter(e => e==='confirm').length,2);
});
test('billing failure prevents provider creation and setup persistence failure refunds unused escrow', async () => {
  const f = fixture();
  f.usage.reserve = async () => { throw Error('allowance exhausted'); };
  await assert.rejects(f.service.create('owner'),/allowance exhausted/);
  assert.equal(f.providerCalls.length,0);
  assert.deepEqual(f.events,['redis-reserve','release']);
  const g = fixture();
  g.store.save = async () => { throw Error('Redis write failed'); };
  await assert.rejects(g.service.create('owner'),/Redis write failed/);
  assert.equal(g.providerCalls.length,0);
  assert.deepEqual(g.events,['redis-reserve','quota-avatar','refund-setup','release']);
});
test('runtime policy accepts explicit zero, rejects implicit unlimited, client audit identity and fractional quotas', () => {
  const input = {expectedVersion:0,reason:'Actual provider account limits',live_minutes_monthly:0,research_monthly:10,analyses_monthly:10,upload_mib_monthly:20};
  assert.equal(validateRuntimeLimits(input).live_minutes_monthly,0);
  for (const bad of [{...input,live_minutes_monthly:null},{...input,research_monthly:NaN},{...input,analyses_monthly:1.5},{...input,actor:'spoofed'},{...input,expectedVersion:-1}]) {
    assert.throws(() => validateRuntimeLimits(bad));
  }
});

test('slow accounting receipts never block microphone activity, and a failed receipt stops subsequent activity', async () => {
  const f = fixture();
  let rejectReceipt: (e: Error) => void = () => {};
  f.usage.confirm = () => new Promise<void>((_resolve,reject) => { rejectReceipt=reject; });
  const info=await f.service.create('owner','en','VOICE_ONLY');
  const activity=await f.service.activity('owner',info.id);
  assert.equal(activity.idleDeadline,125000,'reserved conversation can proceed without waiting for the receipt');
  rejectReceipt(new Error('database unavailable'));
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.service.activity('owner',info.id),/allowance could not be confirmed/);
});
