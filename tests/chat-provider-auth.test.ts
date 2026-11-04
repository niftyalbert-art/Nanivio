import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const bundle=await build({entryPoints:['src/server/streamService.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
function fixture(member=true,rejectSend=false,fault?:{missing?:boolean;status?:number;timeout?:boolean;invalid?:boolean}){
  const requests:any[]=[],warnings:any[]=[];
  const context=vm.createContext({
    module:{exports:{}},require:createRequire(import.meta.url),Buffer,URL,AbortSignal,Response,
    process:{env:fault?.missing?{}:{STREAM_API_KEY:'fixture-public-key',STREAM_API_SECRET:'fixture-signing-secret'}},
    console:{warn:(...args:any[])=>warnings.push(args)},
    fetch:async(raw:string,options:any)=>{
      const url=new URL(raw);
      const token=JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url').toString());
      if(url.pathname.endsWith('/message')){
        assert.equal(token.user_id,'alice','Provider permissions must apply to the verified author.');
        assert.equal(token.server,undefined);
      }else{
        assert.equal(token.server,true);
      }
      const body=options.body?JSON.parse(options.body):undefined;
      requests.push({url,body,token});
      if(fault?.timeout){const error=new Error('PRIVATE_TRANSPORT_DETAIL');error.name='TimeoutError';throw error;}
      if(fault?.invalid)return new Response('<html>PRIVATE_CONTENT</html>');
      if(fault?.status)return Response.json({message:'PRIVATE_PROVIDER_DETAIL',code:17},{status:fault.status});
      if(url.pathname==='/members')return Response.json({members:member?[{user_id:'alice'}]:[]});
      if(url.pathname.endsWith('/message')){
        if(rejectSend)return Response.json({code:17,message:'PRIVATE_UPSTREAM_BODY',token:'PRIVATE_TOKEN'},{status:403});
        assert.equal(body.message.user_id,'alice');
        return Response.json({message:{...body.message,id:'saved-fixture'}});
      }
      if(url.pathname==='/channels'){
        assert.deepEqual([...body.filter_conditions.members.$in],['alice']);
        return Response.json({channels:[]});
      }
      throw new Error('Unexpected provider request');
    },
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  return {api:(context.module as any).exports,requests,warnings};
}
const message={id:'client-fixture',channelId:'room',userId:'alice',userName:'Fixture',text:'Fixture only',createdAt:1,reactions:[]};
test('missing chat setup and upstream failures return safe actionable support codes without sending',async()=>{
  for(const [fault,code,status] of [
    [{missing:true},'CHAT_CONFIGURATION_REQUIRED',503],
    [{status:401},'CHAT_PROVIDER_REJECTED',502],
    [{status:403},'CHAT_PROVIDER_REJECTED',502],
    [{status:429},'CHAT_PROVIDER_LIMIT',503],
    [{status:503},'CHAT_PROVIDER_UNAVAILABLE',502],
    [{timeout:true},'CHAT_PROVIDER_TIMEOUT',504],
    [{invalid:true},'CHAT_PROVIDER_RESPONSE_INVALID',502],
  ] as const){
    const f=fixture(true,false,fault);
    await assert.rejects(f.api.addStreamMessage('room',message),(error:any)=>{
      assert.equal(error.serviceCode,code);assert.equal(error.status,status);
      assert.doesNotMatch(error.message,/PRIVATE|fixture-signing|fixture-public/);
      return true;
    });
    assert.equal(f.requests.some(request=>request.url.pathname.endsWith('/message')),false);
    assert.doesNotMatch(JSON.stringify(f.warnings),/PRIVATE|fixture-signing|fixture-public/);
  }
});
test('message sends retain the verified actor token after authoritative membership succeeds',async()=>{
  const f=fixture();
  const saved=await f.api.addStreamMessage('room',message);
  assert.equal(saved.id,'saved-fixture');
  assert.deepEqual(f.requests.map(r=>r.url.pathname),['/members','/channels/messaging/room/message']);
});
test('nonmembers cannot reach message publication',async()=>{
  const f=fixture(false);
  await assert.rejects(()=>f.api.addStreamMessage('room',message),(error:any)=>error.status===403);
  assert.equal(f.requests.length,1);
});
test('private channel listings retain account filters despite server authentication',async()=>{
  const f=fixture();
  assert.equal((await f.api.getActiveStreamChannels('alice')).length,0);
  assert.equal(f.requests.length,1);
  await f.api.getActiveStreamChannels('');
  assert.equal(f.requests.length,1);
});
test('upstream failures log only safe operation/status/code and never succeed',async()=>{
  const f=fixture(true,true);
  await assert.rejects(()=>f.api.addStreamMessage('room',message),(error:any)=>error.status===502);
  assert.match(JSON.stringify(f.warnings),/"status":403/);
  assert.match(JSON.stringify(f.warnings),/"code":17/);
  assert.doesNotMatch(JSON.stringify(f.warnings),/PRIVATE_|alice|room|signing|Fixture only/);
});
