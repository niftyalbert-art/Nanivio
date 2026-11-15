import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';

// Execute the actual route body without booting the application or providers.
async function fixture(options:{allowed?:boolean;allowanceError?:boolean;signingError?:boolean}={}) {
  const source=readFileSync('server.ts','utf8');
  const start=source.indexOf('async (req, res) => {',source.indexOf('app.post("/api/agora/token"'));
  const end=source.indexOf('\n});',start);
  const compiled=await transform(`const handler=${source.slice(start,end+2)};`,{loader:'ts'});
  const events:string[]=[],participants:any[]=[];
  const handler=new Function('authenticatedUserId','canJoinAgoraCall','communicationTokenSeconds',
    'generateAgoraRtcToken','registerAgoraParticipant','callStartupTracing','classifyCallTokenFailure',
    `${compiled.code};return handler;`)(
      ()=> 'canonical-user',()=>options.allowed!==false,
      async()=>{events.push('allowance');if(options.allowanceError)throw Error('no allowance');return 60;},
      ()=>{events.push('signing');if(options.signingError)throw Error('no signing');return {token:'fixture',appId:'fixture'};},
      (...args:any[])=>{events.push('registration');participants.push(args);},
      {phase(){}},()=>({status:503,error:'unavailable',code:'CALL_TOKEN_UNAVAILABLE'}));
  const req:any={body:{channelName:'nanivio_call_fixture',registerParticipant:true,callType:'audio',uid:'spoofed'},
    authUser:{displayName:'Canonical name'}};
  const res:any={statusCode:200,status(code:number){this.statusCode=code;return this;},
    json(value:any){this.body=value;return this;}};
  return {handler,req,res,events,participants};
}

test('combined admission registers canonical identity only after authorization, allowance and signing',async()=>{
  const f=await fixture();await f.handler(f.req,f.res);
  assert.equal(f.res.statusCode,200);
  assert.equal(f.res.body.participantRegistered,true);
  assert.deepEqual(f.events,['allowance','signing','registration']);
  assert.deepEqual(f.participants,[['nanivio_call_fixture','audio',
    {uid:'canonical-user',name:'Canonical name',role:'publisher'}]]);
});
for(const failure of ['authorization','allowance','signing','callType','channel','disconnected'] as const){
  test(`combined admission cannot register after ${failure} failure`,async()=>{
    const f=await fixture({allowed:failure!=='authorization',allowanceError:failure==='allowance',signingError:failure==='signing'});
    if(failure==='callType')f.req.body.callType='unsupported';
    if(failure==='channel')f.req.body.channelName='uninvited-room';
    if(failure==='disconnected')f.res.destroyed=true;
    await f.handler(f.req,f.res);
    assert.equal(f.participants.length,0);
    assert.notEqual(f.res.body?.participantRegistered,true);
  });
}
test('legacy token requests and renewals do not register or return a false acknowledgement',async()=>{
  const f=await fixture();delete f.req.body.registerParticipant;
  await f.handler(f.req,f.res);
  assert.equal(f.res.statusCode,200);assert.equal(f.participants.length,0);
  assert.equal(f.res.body.participantRegistered,undefined);
});
