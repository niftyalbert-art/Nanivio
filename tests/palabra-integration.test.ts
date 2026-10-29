import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { supportsPalabraPair } from '../src/shared/palabraLanguages.ts';
import { buildLangpretationReadiness } from '../src/shared/langpretationReadiness.ts';

const bundle = await build({
  entryPoints:['src/server/palabraCallRoute.ts'],bundle:true,write:false,platform:'node',format:'cjs',
  plugins:[{name:'isolated-ws',setup(b){
    b.onResolve({filter:/^ws$/},()=>({path:'ws',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default globalThis.MockSocket'}));
  }}],
});
function wav(seconds=0.5,rate=16000) {
  const b=Buffer.alloc(44+Math.round(seconds*rate)*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;
}
function fixture() {
  const sockets:any[]=[],intervals=new Map<number,()=>void>(),timeouts=new Map<number,()=>void>();let id=0;
  class MockSocket extends EventEmitter {
    static OPEN=1;readyState=1;sent:any[]=[];terminated=false;
    constructor(public url:string,public options:any){super();sockets.push(this);}
    send(raw:string){this.sent.push(JSON.parse(raw));}
    close(){this.readyState=3;}
    terminate(){this.terminated=true;this.readyState=3;this.emit('close');}
  }
  const context=vm.createContext({
    module:{exports:{}},Buffer,AbortController,MockSocket,process:{env:{PALABRA_API_KEY:'fixture-only-secret'}},
    require:(name:string)=>{assert.equal(name,'node:crypto');return {randomUUID:()=> 'fixture-connection'};},
    console:{warn(){}},setTimeout:(fn:()=>void)=>{timeouts.set(++id,fn);return id;},
    clearTimeout:(i:number)=>timeouts.delete(i),
    setInterval:(fn:()=>void)=>{intervals.set(++id,fn);return id;},clearInterval:(i:number)=>intervals.delete(i),
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  const exports=(context.module as any).exports;
  // Adapter exports are bundled but private: expose its real function through dependency default.
  const calls:any[]=[];
  const handler=exports.createPalabraCallHandler({
    userId:()=> 'owner',authorize:async()=>{},
  });
  const request=()=> {
    const req=Object.assign(new EventEmitter(),{body:{sessionId:'call-1',sourceLang:'en',targetLang:'fr',audioBase64:wav().toString('base64')}});
    const res=Object.assign(new EventEmitter(),{code:200,body:null as any,status(code:number){this.code=code;return this;},json(body:any){this.body=body;calls.push(body);return this;}});
    return {req,res};
  };
  function message(socket:any,message_type:string,data:any){socket.emit('message',Buffer.from(JSON.stringify({message_type,data})));}
  function start(socket:any){
    socket.emit('open');
    assert.equal(socket.sent[0].message_type,'set_task');
    assert.equal(socket.sent[0].data.pipeline.translations[0].speech_generation.voice_cloning,false);
    // Audio must wait for the provider's running acknowledgement.
    assert.equal(intervals.size,0);
    message(socket,'task_status',{command:'set_task',task_status:'running',event:'started'});
    for(let n=0;n<8;n++)for(const fn of [...intervals.values()])fn();
  }
  function complete(socket:any,overrides:any={}){
    message(socket,'validated_transcription',{transcription:{transcription_id:'phrase',language:'en',text:'Hello.'}});
    message(socket,'translated_transcription',{transcription:{transcription_id:'phrase',language:'fr',text:'Bonjour.'}});
    message(socket,'output_audio_data',{language:'fr',data:Buffer.alloc(2400).toString('base64'),...overrides});
    message(socket,'end_of_stream',{});
  }
  return {exports,handler,request,sockets,start,complete,message,intervals,timeouts};
}
const advance = () => new Promise<void>(resolve => setImmediate(resolve));

test('Palabra routes exactly the 90 directed international pairs, preserving all specialist routes',()=>{
  const languages=['en','fr','es','ar','de','it','pt','zh','ja','ko','sw','lg','ha','ak','tw-ak','fat','ee','gaa'];
  assert.equal(languages.flatMap(a=>languages.filter(b=>supportsPalabraPair(a,b))).length,90);
  assert.equal(supportsPalabraPair('ar','en'),true);
  assert.equal(supportsPalabraPair('en','ar'),true);
  for(const language of languages.slice(10)){
    assert.equal(supportsPalabraPair(language,'en'),false);
    assert.equal(supportsPalabraPair('en',language),false);
  }
  const report=buildLangpretationReadiness({
    active:()=>true,speech:()=>false,translation:()=>false,
    integratedSpeech:(a,b)=>supportsPalabraPair(a,b)?true:undefined,
  });
  assert.equal(report.configured,108);assert.equal(report.liveVerified,0);
  assert.equal(report.pairs.find(p=>p.source==='en'&&p.target==='lg')!.configured,false);
});

test('actual provider bridge waits for acknowledgement, paces audio, requires all output and closes upstream',async()=>{
  const f=fixture(),{req,res}=f.request();
  const promise=f.handler(req,res);
  await advance();
  assert.equal(f.sockets.length,1);const ws=f.sockets[0];
  assert.doesNotMatch(ws.url,/fixture-only-secret|token=/);
  assert.equal(ws.options.headers.Authorization,'Bearer fixture-only-secret');
  assert.equal(ws.options.followRedirects,false);
  f.start(ws);
  assert.ok(ws.sent.some((m:any)=>m.message_type==='input_audio_data'));
  assert.equal(ws.sent.at(-1).message_type,'end_task');
  f.complete(ws);await promise;
  assert.equal(res.code,200);assert.equal(res.body.translatedText,'Bonjour.');
  assert.equal(res.body.text,'Hello.');assert.equal(res.body.provider,'palabra-s2s');
  assert.equal(Buffer.from(res.body.audioBase64,'base64').toString('ascii',0,4),'RIFF');
  assert.equal(ws.terminated,true);assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);
});

test('provider errors are sanitized, close the session and never retry',async()=>{
  const f=fixture(),{req,res}=f.request();const promise=f.handler(req,res);await advance();
  const ws=f.sockets[0];ws.emit('open');
  f.message(ws,'error',{code:'UNAUTHORIZED',desc:'fixture-only-secret private upstream payload'});
  await promise;
  assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.body),/fixture-only-secret|upstream payload/);
  assert.equal(f.sockets.length,1);assert.equal(ws.terminated,true);
});

test('incomplete output and wrong-language audio are not reported as successful translations',async()=>{
  for(const mode of ['missing_audio','wrong_language']){
    const f=fixture(),{req,res}=f.request();const promise=f.handler(req,res);await advance();
    const ws=f.sockets[0];f.start(ws);
    if(mode==='missing_audio') f.message(ws,'end_of_stream',{});
    else f.complete(ws,{language:'de'});
    await promise;assert.equal(res.code,502);assert.equal(res.body.success,false);
  }
});

test('aborted requests and the hard deadline terminate upstream sessions',async()=>{
  for(const mode of ['cancel','deadline']){
    const f=fixture(),{req,res}=f.request();const promise=f.handler(req,res);await advance();
    if(mode==='cancel')req.emit('aborted');else for(const fn of [...f.timeouts.values()])fn();
    await promise;assert.equal(f.sockets[0].terminated,true);
    assert.equal(mode==='cancel'?res.body:res.code,mode==='cancel'?null:504);
    assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);
  }
});

test('invalid WAV, unsupported pairs, missing configuration and denied calls cannot open paid connections',async()=>{
  for(const mode of ['bad_wav','too_long','same_language','specialist','missing_key','denied']){
    const f=fixture(),{req,res}=f.request();
    if(mode==='bad_wav')req.body.audioBase64=Buffer.from('not wav').toString('base64');
    if(mode==='too_long')req.body.audioBase64=wav(10).toString('base64');
    if(mode==='same_language')req.body.targetLang='en';
    if(mode==='specialist')req.body.targetLang='ak';
    const handler=mode==='missing_key'||mode==='denied'?f.exports.createPalabraCallHandler({
      userId:()=> 'owner',configured:()=>mode!=='missing_key',authorize:async()=>{throw new Error('Denied');}
    }):f.handler;
    await handler(req,res);assert.ok(res.code>=400);assert.equal(f.sockets.length,0);
  }
});

test('one in-flight phrase per account is enforced and released after failure',async()=>{
  const f=fixture(),a=f.request(),b=f.request();
  const first=f.handler(a.req,a.res);await advance();
  await f.handler(b.req,b.res);assert.equal(b.res.code,429);assert.equal(f.sockets.length,1);
  f.sockets[0].emit('error',new Error('transport fixture'));await first;
  const c=f.request(),third=f.handler(c.req,c.res);await advance();
  assert.equal(f.sockets.length,2);c.req.emit('aborted');await third;
});

test('production endpoint requires authentication and authorizes connected participants, billing and admin settings',()=>{
  const source=readFileSync('server.ts','utf8');
  const ast=ts.createSourceFile('server.ts',source,ts.ScriptTarget.Latest,true);
  let route:ts.CallExpression|undefined;
  function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.arguments[0]?.getText(ast)==='"/api/langpretation/call/translate-audio"')route=n;ts.forEachChild(n,visit);}
  visit(ast);assert.ok(route);
  assert.equal(route.arguments[1].getText(ast),'requireAuthenticatedUser');
  const body=route.arguments[2].getText(ast);
  for(const guard of ['canTranslateLiveCall','session.status','getPersistentSubscription','langpretationMinutesRemaining','normalizedBillingEnabled','nanivio_langpretation_configs','serverLanguageOverrides'])
    assert.ok(body.includes(guard),guard);
  assert.doesNotMatch(source.slice(source.indexOf('app.post("/api/langpretation/call/translate-audio"'),source.indexOf('app.get("/api/langpretation/speech-readiness"')),/recordLangpretationUsagePersistent/,'existing call meter must not be charged twice');
});
