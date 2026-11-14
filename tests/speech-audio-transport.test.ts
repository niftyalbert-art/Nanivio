import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,getEventListeners} from 'node:events';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({
  entryPoints:['src/server/speechAudioTransport.ts'],bundle:true,write:false,platform:'node',format:'cjs',
  plugins:[{name:'isolate-https',setup(build){
    build.onResolve({filter:/^node:https$/},()=>({path:'https',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:
      'export function request(...args){return fixtureRequest(...args)}'}));
  }}],
});
function fixture(scenario:(res:any,req:any)=>void){
  const calls:any[]=[];
  const context=vm.createContext({
    module:{exports:{}},Buffer,Response,Headers,
    fixtureRequest(url:URL,options:any,receive:(res:any)=>void){
      const req:any=new EventEmitter();
      req.destroyed=false;req.destroy=()=>{req.destroyed=true;};
      req.end=(body:string)=>{
        calls.push({url,options,body,req});
        const res:any=new EventEmitter();
        res.statusCode=200;res.headers={'content-type':'audio/wav','content-length':'6'};
        res.complete=false;res.destroyed=false;
        res.destroy=()=>{res.destroyed=true;res.emit('close');};
        calls[calls.length-1].res=res;
        queueMicrotask(()=>{receive(res);scenario(res,req);});
      };
      return req;
    },
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  const api=(context.module as any).exports;
  const controller=new AbortController();
  return {calls,controller,run:()=>api.requestSpeechAudio(new URL('https://speech.example/synthesize'),
    {'Content-Type':'application/json','Ocp-Apim-Subscription-Key':'fixture-only'},
    JSON.stringify({text:'Akwaaba',language:'twi'}),controller.signal)};
}
test('native audio transport assembles every chunk in a single request',async()=>{
  const f=fixture(res=>{
    res.emit('data',Buffer.from('abc'));res.emit('data',Buffer.from('def'));
    res.complete=true;res.emit('end');
  });
  const response=await f.run();
  assert.equal(response.status,200);assert.equal(await response.text(),'abcdef');
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].options.headers['Accept-Encoding'],'identity');
  assert.equal(f.calls[0].options.headers['Content-Length'],Buffer.byteLength(f.calls[0].body));
  assert.equal(getEventListeners(f.controller.signal,'abort').length,0);
});
test('short successful response cannot be accepted as a complete download',async()=>{
  const f=fixture(res=>{res.emit('data',Buffer.from('abc'));res.complete=true;res.emit('end');});
  await assert.rejects(f.run(),/interrupted/);
  assert.equal(f.calls.length,1);assert.ok(f.calls[0].req.destroyed);
});
test('aborted response never returns its partial audio or retries',async()=>{
  const f=fixture(res=>{res.emit('data',Buffer.from('abc'));res.emit('aborted');});
  await assert.rejects(f.run(),/interrupted/);assert.equal(f.calls.length,1);
});
test('caller cancellation closes a partially received request and removes its listener',async()=>{
  const f=fixture(res=>{res.emit('data',Buffer.from('abc'));f.controller.abort();});
  await assert.rejects(f.run(),/cancelled/);
  assert.ok(f.calls[0].req.destroyed);
  assert.equal(getEventListeners(f.controller.signal,'abort').length,0);
});
test('already cancelled requests never contact the provider',async()=>{
  const f=fixture(()=>assert.fail('No request allowed'));f.controller.abort();
  await assert.rejects(f.run(),/cancelled/);assert.equal(f.calls.length,0);
});
test('oversized responses are terminated without returning audio',async()=>{
  const f=fixture(res=>res.emit('data',Buffer.alloc(8*1024*1024+1)));
  await assert.rejects(f.run(),/interrupted/);assert.equal(f.calls.length,1);
  assert.ok(f.calls[0].res.destroyed);
});
test('provider rejections are returned for safe classification without retrying',async()=>{
  const f=fixture(res=>{
    const body=Buffer.from('{"message":"quota exceeded"}');
    res.statusCode=403;res.headers={'content-type':'application/json','content-length':String(body.length)};
    res.emit('data',body);res.complete=true;res.emit('end');
  });
  const response=await f.run();assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{message:'quota exceeded'});assert.equal(f.calls.length,1);
});
test('redirects are never followed with subscription credentials',async()=>{
  const f=fixture(res=>{
    res.statusCode=302;res.headers={location:'https://other.example','content-length':'0'};
    res.complete=true;res.emit('end');
  });
  assert.equal((await f.run()).status,302);assert.equal(f.calls.length,1);
});
test('network errors return safe messages and never retry',async()=>{
  const f=fixture((_res,req)=>req.emit('error',new Error('sensitive upstream detail')));
  await assert.rejects(f.run(),error=>{
    assert.equal((error as Error).message,'Speech audio transport failed.');return true;
  });
  assert.equal(f.calls.length,1);assert.equal(getEventListeners(f.controller.signal,'abort').length,0);
});
