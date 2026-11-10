import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { build } from 'esbuild';
import { WebSocket } from 'ws';
import { CallLifecycle } from '../src/lib/callLifecycle';
import { finishAnsweredCall } from '../src/lib/callMediaErrors';

// Actual signaling server and real WebSockets on an isolated HTTP server.
// Auth fixture exists only in this bundle; no app auth bypass or customer writes.
async function fixture(t: any, expired: string[] = []) {
  const usage:any[]=[];
  const activeAccounts = new Set(['caller-id','receiver-id','outsider-id']);
  const result = await build({
    entryPoints: ['src/server/realtimeServer.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'isolated-auth', setup(b) {
      b.onResolve({ filter: /persistentAuth\.ts$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      b.onResolve({filter:/supabaseServer(?:\.ts)?$/},()=>({path:'database',namespace:'fixture'}));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({path}) => ({ loader: 'js', contents: path==='database'
        ? `export function getServerSupabase(){return {
          rpc:(name,args)=>__communicationRPC(name,args),
          from:(table)=>{
            if(table!=='nanivio_users')throw Error('Unexpected fixture table');
            let ids=[];
            const query={
              select:()=>query,
              in:(_column,values)=>{ids=values;return query},
              eq:()=>query,
              abortSignal:async()=>({data:ids.filter(__accountActive).map(id=>({id})),error:null}),
            };
            return query;
          },
        }}`
        : `
        export function adminFromToken(){return null}
        export async function persistentAuthConfigured(){return true}
        export async function userFromToken(token){
          if(!['caller','receiver','outsider'].includes(token))return null;
          return {id:token+'-id',nvId:token==='receiver'?'0486222222':token==='caller'?'0486111111':'0486333333',
            firstName:token,role:'PERSONAL',accountStatus:'ACTIVE',preferredLanguage:'en'};
        }` }));
    } }],
  });
  const module = { exports: {} as any };
  new Function('require','module','exports','__communicationRPC','__accountActive',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports,
    async(_name:string,args:any)=>{
      usage.push(args);
      const ended=expired.includes(args.payload?.userId);
      return {data:{success:true,policy:{callTrialDays:30,warningSeconds:60},trialStartedAt:ended?'2020-01-01T00:00:00Z':null,
        trialEndsAt:ended?'2020-02-01T00:00:00Z':null,callSecondsRemaining:ended?0:null,sharedCallMinutes:0,
        liveTrialSecondsRemaining:180,translatedSecondsRemaining:0,amount:args.payload?.amount},error:null};
    },(id:string)=>activeAccounts.has(id));
  const server = createServer();
  const wss = module.exports.setupRealtimeServer(server);
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  async function peer(token: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/ws`);
    sockets.push(socket);
    const messages: any[] = [];
    socket.on('message', raw => messages.push(JSON.parse(String(raw))));
    await once(socket,'open');
    const send = (type: string,payload: any) => socket.send(JSON.stringify({type,payload}));
    const wait = async (type: string,id?: string) => {
      const deadline=Date.now()+2000;
      while(Date.now()<deadline) {
        const index=messages.findIndex(m=>m.type===type&&(!id||m.payload?.callId===id));
        if(index>=0)return messages.splice(index,1)[0].payload;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw new Error(`Missing ${type} for ${id||token}`);
    };
    send('auth:presence',{token});
    await wait('auth:presence_ack');
    return {send,wait,socket,messages};
  }
  return {peer,canJoin:module.exports.canJoinAgoraCall,usage,revoke:(id:string)=>activeAccounts.delete(id)};
}

test('account deactivation closes existing sockets and clears a ringing call without waiting for token expiry',async t=>{
  const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver');
  const callId='deletion-access-drain';
  a.send('call:initiate',{callId,callType:'audio',recipientId:'receiver-id'});
  await b.wait('call:incoming',callId);
  f.revoke('caller-id');
  const ended=await b.wait('call:ended',callId);
  assert.equal(ended.reason,'PARTICIPANT_DISCONNECTED');
  assert.equal(f.canJoin('caller-id','0486111111',`nanivio_call_${callId}`),false);
});

test('an expired recipient can answer free; only caller quota is reserved after both media connections',async t=>{
  const f=await fixture(t,['receiver-id']),a=await f.peer('caller'),b=await f.peer('receiver');
  const callId='billing-recipient';
  a.send('call:initiate',{callId,callType:'audio',recipientId:'receiver-id'});
  await b.wait('call:incoming',callId);
  b.send('call:accept',{callId});await a.wait('call:accepted',callId);await b.wait('call:connected',callId);
  assert.equal(f.usage.some(row=>row.action==='CONNECT'),false);
  a.send('call:media_ready',{callId});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.usage.some(row=>row.action==='CONNECT'),false);
  b.send('call:media_ready',{callId});
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(f.usage.filter(row=>row.action==='CONNECT').length,2);
  const base=f.usage.filter(row=>row.action==='RESERVE'&&row.payload.resource==='call');
  assert.equal(base.length,1);assert.equal(base[0].payload.userId,'caller-id');
  a.send('call:end',{callId});await b.wait('call:ended',callId);
});

test('an expired caller cannot ring another user without a subscription',async t=>{
  const f=await fixture(t,['caller-id']),a=await f.peer('caller');
  await f.peer('receiver');
  a.send('call:initiate',{callId:'expired-caller',callType:'video',recipientId:'receiver-id'});
  const error=await a.wait('call:error');
  assert.equal(error.subscriptionRequired,true);
  assert.equal(f.usage.some(row=>row.action==='RESERVE'||row.action==='CONNECT'),false);
});

test('call language updates reach both users but outsiders and unsupported languages are rejected',async t=>{
  const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver'),outsider=await f.peer('outsider');
  a.send('call:initiate',{callId:'languages',callType:'video',recipientId:'receiver-id'});await b.wait('call:incoming','languages');
  b.send('call:accept',{callId:'languages'});await a.wait('call:accepted','languages');await b.wait('call:connected','languages');
  b.send('call:language',{callId:'languages',language:'fr'});
  for(const peer of [a,b])assert.deepEqual(await peer.wait('call:participant_language','languages'),{callId:'languages',userId:'receiver-id',language:'fr'});
  outsider.send('call:language',{callId:'languages',language:'ar'});await outsider.wait('call:billing_notice','languages');
  a.send('call:language',{callId:'languages',language:'not-a-language'});await a.wait('call:billing_notice','languages');
  a.send('call:end',{callId:'languages'});await b.wait('call:ended','languages');
});

test('legacy group invitations are blocked before quotas or ringing; ordinary calling is unaffected',async t=>{
  const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver');
  for(const payload of [
    {callId:'grp_call_123',channelName:'nanivio_group_123',callType:'audio'},
    {callId:'custom-group',channelName:'nanivio_group_456',callType:'video'},
  ]){
    a.send('call:initiate',{...payload,recipientId:'receiver-id'});
    assert.match((await a.wait('call:error')).message,/Group calling is temporarily unavailable/);
  }
  assert.equal(f.usage.length,0);
  a.send('call:initiate',{callId:'allowed-p2p',callType:'audio',recipientId:'receiver-id'});
  await b.wait('call:incoming','allowed-p2p');
  a.send('call:end',{callId:'allowed-p2p'});await b.wait('call:ended','allowed-p2p');
});

for(const type of ['audio','video']) {
  test(`${type}: late receiver registration recovers an invitation addressed by Nanivio number`,async t=>{
    const f=await fixture(t),a=await f.peer('caller');
    const callId=`late-number-${type}`;
    a.send('call:initiate',{callId,callType:type,recipientId:'old-contact-id',recipientNvId:'NV-0486222222'});
    assert.equal((await a.wait('call:ringing',callId)).deliveredToLiveRecipient,false);
    const outsider=await f.peer('outsider');
    assert.equal(outsider.messages.some(m=>m.type==='call:incoming'),false);
    const b=await f.peer('receiver');
    assert.equal((await b.wait('call:incoming',callId)).callType,type);
    b.send('call:accept',{callId});
    await a.wait('call:accepted',callId);await b.wait('call:connected',callId);
    a.send('call:end',{callId});
    await a.wait('call:ended',callId);await b.wait('call:ended',callId);
  });
  test(`${type}: a cancelled invitation is never replayed to a late receiver`,async t=>{
    const f=await fixture(t),a=await f.peer('caller');
    const callId=`cancelled-late-${type}`;
    a.send('call:initiate',{callId,callType:type,recipientId:'old-contact-id',recipientNvId:'NV-0486222222'});
    await a.wait('call:ringing',callId);
    a.send('call:end',{callId});await a.wait('call:ended',callId);
    const b=await f.peer('receiver');
    assert.equal(b.messages.some(m=>m.type==='call:incoming'),false);
    assert.equal(f.canJoin('receiver-id','0486222222',`nanivio_call_${callId}`),false);
  });
  test(`${type}: caller cancellation reaches a receiver dialled through a stale contact ID`,async t=>{
    const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver');
    const callId=`fallback-${type}`,channelName=`nanivio_call_${callId}`;
    a.send('call:initiate',{callId,channelName,callType:type,recipientId:'old-contact-id',recipientNvId:'NV-0486222222'});
    await b.wait('call:incoming',callId);
    a.send('call:end',{callId});
    await b.wait('call:ended',callId);
    await a.wait('call:ended',callId);
    assert.equal(f.canJoin('receiver-id','0486222222',channelName),false);
  });
  test(`${type}: recipient can end a ringing call; unrelated users cannot`,async t=>{
    const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver'),c=await f.peer('outsider');
    const callId=`reject-${type}`,channelName=`nanivio_call_${callId}`;
    a.send('call:initiate',{callId,channelName,callType:type,recipientId:'receiver-id'});
    await b.wait('call:incoming',callId);
    c.send('call:end',{callId});await c.wait('call:error');
    assert.equal(f.canJoin('receiver-id','0486222222',channelName),true);
    b.send('call:end',{callId});await a.wait('call:ended',callId);await b.wait('call:ended',callId);
    assert.equal(f.canJoin('receiver-id','0486222222',channelName),false);
  });
  test(`${type}: answer then hang up ends both participants and revokes room admission`,async t=>{
    const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver');
    const callId=`connected-${type}`,channelName=`nanivio_call_${callId}`;
    a.send('call:initiate',{callId,channelName,callType:type,recipientId:'receiver-id'});
    await b.wait('call:incoming',callId);
    b.send('call:accept',{callId});await a.wait('call:accepted',callId);await b.wait('call:connected',callId);
    assert.equal(f.canJoin('caller-id','0486111111',channelName),true);
    a.send('call:end',{callId});await a.wait('call:ended',callId);await b.wait('call:ended',callId);
    assert.equal(f.canJoin('caller-id','0486111111',channelName),false);
    a.send('call:end',{callId});
    assert.equal((await a.wait('call:ended',callId)).alreadyEnded,true);
    const newId=`next-${type}`,newChannel=`nanivio_call_${newId}`;
    a.send('call:initiate',{callId:newId,channelName:newChannel,callType:type,recipientId:'receiver-id'});
    await b.wait('call:incoming',newId);
    // A retried old hang-up cannot terminate a newly-created call.
    a.send('call:end',{callId});await a.wait('call:ended',callId);
    assert.equal(f.canJoin('receiver-id','0486222222',newChannel),true);
    a.send('call:end',{callId:newId});await b.wait('call:ended',newId);
  });
  test(`${type}: caller losing its socket clears the recipient's ringing call`,async t=>{
    const f=await fixture(t),a=await f.peer('caller'),b=await f.peer('receiver');
    const callId=`disconnect-${type}`,channelName=`nanivio_call_${callId}`;
    a.send('call:initiate',{callId,channelName,callType:type,recipientId:'old-contact-id',recipientNvId:'0486222222'});
    await b.wait('call:incoming',callId);
    a.socket.close();
    const ended=await b.wait('call:ended',callId);
    assert.equal(ended.reason,'PARTICIPANT_DISCONNECTED');
    assert.equal(f.canJoin('receiver-id','0486222222',channelName),false);
  });
}

test('ended-call tombstones reject late invitations/acceptances and remain bounded',()=>{
  const guard=new CallLifecycle();
  guard.end('cancelled');
  assert.equal(guard.hasEnded('cancelled'),true);
  assert.equal(guard.hasEnded('new-call'),false);
  for(let n=0;n<70;n++)guard.end(String(n));
  assert.equal(guard.hasEnded('cancelled'),false);
  assert.equal(guard.hasEnded('69'),true);
});
test('cancelling setup does not begin billing after asynchronous media resolves',async()=>{
  let billed=false;
  await finishAnsweredCall(async()=>false,async()=>{billed=true},()=>{throw new Error('unexpected')});
  assert.equal(billed,false);
});

test('hang-ups survive reconnect delay, expire safely and cannot cross accounts',async()=>{
  const result=await build({
    entryPoints:['src/lib/realtimeClient.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',
    plugins:[{name:'auth-stub',setup(b){
      b.onResolve({filter:/authClient$/},()=>({path:'auth',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const authClient={getToken:()=>null}'}));
    }}],
  });
  const module={exports:{} as any};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const client=module.exports.realtimeClient;
  const sent:any[]=[];
  let reconnects=0;
  client.connect=()=>{reconnects++};
  client.registerUser({id:'caller-id',name:'Caller'});
  client.socket={readyState:3,send:(raw:string)=>sent.push(JSON.parse(raw))};
  client.endCall('offline','channel','caller-id');
  assert.equal(reconnects,1);
  assert.equal(sent.length,0);
  client.socket.readyState=1;
  client.flushPendingCallEnds();
  assert.equal(sent[0].type,'call:end');
  assert.equal(sent[0].payload.callId,'offline');
  client.pendingCallEnds.get('offline').expiresAt=0;
  client.flushPendingCallEnds();
  assert.equal(client.pendingCallEnds.size,0);
  client.endCall('old-account','channel','caller-id');
  client.registerUser({id:'other-id',name:'Other'});
  const count=sent.length;
  client.flushPendingCallEnds();
  assert.equal(sent.length,count);
  assert.equal(client.pendingCallEnds.size,0);
});
