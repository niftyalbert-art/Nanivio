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
async function fixture(t: any) {
  const result = await build({
    entryPoints: ['src/server/realtimeServer.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'isolated-auth', setup(b) {
      b.onResolve({ filter: /persistentAuth\.ts$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
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
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
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
    return {send,wait,socket};
  }
  return {peer,canJoin:module.exports.canJoinAgoraCall};
}

for(const type of ['audio','video']) {
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
