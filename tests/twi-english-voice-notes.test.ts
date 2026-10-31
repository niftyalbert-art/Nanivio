import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({
  stdin:{contents:`export * from './src/server/voiceNotePipeline.ts';
    export {transcribeProviderAudio} from './src/server/speechProviders.ts';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'cjs',
});
function wav(seconds=.25){
  const a=Buffer.alloc(44+Math.round(seconds*32000));
  a.write('RIFF');a.writeUInt32LE(a.length-8,4);a.write('WAVEfmt ',8);
  a.writeUInt32LE(16,16);a.writeUInt16LE(1,20);a.writeUInt16LE(1,22);
  a.writeUInt32LE(16000,24);a.writeUInt32LE(32000,28);a.writeUInt16LE(2,32);
  a.writeUInt16LE(16,34);a.write('data',36);a.writeUInt32LE(a.length-44,40);return a;
}
function fixture(reply?:(request:any)=>Response|Promise<Response>|undefined,fastDeadline=false){
  const requests:any[]=[],warnings:any[]=[];
  const context=vm.createContext({
    module:{exports:{}},Buffer,URL,Response,FormData,Blob,
    AbortSignal:fastDeadline?{
      any:AbortSignal.any.bind(AbortSignal),
      timeout:(ms:number)=>{
        if(ms!==20000)return AbortSignal.timeout(ms);
        const control=new AbortController();setTimeout(()=>control.abort(),10);return control.signal;
      },
    }:AbortSignal,
    process:{env:{KHAYA_API_KEY:'fixture-key-not-a-real-secret'}},
    console:{warn:(...args:any[])=>warnings.push(args)},
    fetch:async(url:any,options:any)=>{
      const request={url:new URL(url),...options};requests.push(request);
      assert.equal(request.url.hostname,'translation-api.ghananlp.org','This pair must never request Gemini or another provider.');
      const custom=reply?.(request);if(custom)return await custom;
      if(request.url.pathname.includes('/transcribe'))return new Response(JSON.stringify({text:'Recognized speech fixture'}));
      if(request.url.pathname.endsWith('/translate'))return new Response(JSON.stringify({translation:'Translated speech fixture'}));
      if(request.url.pathname.endsWith('/synthesize'))return new Response(wav(),{headers:{'content-type':'audio/wav'}});
      throw new Error('Unexpected speech operation');
    },
  });
  vm.runInContext(bundle.outputFiles[0].text,context);
  return {api:(context.module as any).exports,requests,warnings};
}
test('both Twi–English directions use the documented Khaya speech codes without requiring Gemini',async()=>{
  const f=fixture();
  for(const [source,target] of [['en','ak'],['ak','en']]){
    const result=await f.api.processStagedVoiceNote(wav(),source,target);
    assert.equal(result.providerChain,'khaya-asr+khaya-ghana-nlp+khaya-tts');
    const [asr,mt,tts]=f.requests.slice(-3);
    assert.equal(asr.url.searchParams.get('language'),source==='en'?'eng':'twi');
    assert.equal(JSON.parse(mt.body).lang,source==='en'?'en-tw':'tw-en');
    assert.equal(JSON.parse(tts.body).language,target==='en'?'eng':'twi');
    assert.ok(Buffer.from(result.audioBase64,'base64').length>44);
  }
  assert.equal(f.requests.length,6);
});
test('the pair-specific speech choice does not change default English recognition used elsewhere',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.api.transcribeProviderAudio(wav(),'en'),(error:any)=>error.status===503);
  assert.equal(f.requests.length,0);
});
test('recognition failures identify the stage without leaking provider names or upstream bodies',async()=>{
  const f=fixture(()=>new Response('private upstream error fixture',{status:403}));
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'ak','en'),(error:any)=>{
    assert.equal(error.stage,'recognition');assert.equal(error.status,502);
    assert.doesNotMatch(error.message,/khaya|gemini|upstream|fixture/i);return true;
  });
  assert.equal(f.requests.length,1);
  assert.doesNotMatch(JSON.stringify(f.warnings),/private upstream/);
});
test('translation failure cannot start synthesis or be reported as a successful voice note',async()=>{
  const f=fixture(request=>request.url.pathname.endsWith('/translate')?new Response('',{status:503}):undefined);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'en','ak'),(error:any)=>error.stage==='translation'&&error.status===503);
  assert.equal(f.requests.length,2);
});
test('synthesis failure is distinguished from recognition and text translation',async()=>{
  const f=fixture(request=>request.url.pathname.endsWith('/synthesize')
    ?new Response('<html>not audio</html>',{headers:{'content-type':'text/html'}}):undefined);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'ak','en'),(error:any)=>error.stage==='synthesis');
  assert.equal(f.requests.length,3);
});
test('a stalled recognition response body is cancelled and cannot continue to later paid stages',async()=>{
  const abort=new AbortController();let cancelled=false;
  const f=fixture(request=>request.url.pathname.includes('/transcribe')?new Response(new ReadableStream({
    start(){queueMicrotask(()=>abort.abort());},cancel(){cancelled=true;},
  })):undefined);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'ak','en',abort.signal),
    (error:any)=>error.stage==='recognition'&&error.status===499);
  assert.equal(f.requests.length,1);assert.ok(cancelled);
});
test('a stalled synthesis body is also bounded by cancellation after response headers',async()=>{
  const abort=new AbortController();let cancelled=false;
  const f=fixture(request=>request.url.pathname.endsWith('/synthesize')?new Response(new ReadableStream({
    start(){queueMicrotask(()=>abort.abort());},cancel(){cancelled=true;},
  }),{headers:{'content-type':'audio/wav'}}):undefined);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'en','ak',abort.signal),
    (error:any)=>error.stage==='synthesis'&&error.status===499);
  assert.equal(f.requests.length,3);assert.ok(cancelled);
});
test('a response-body timeout reports the recognition stage and closes the unread stream',async()=>{
  let cancelled=false;
  const f=fixture(()=>new Response(new ReadableStream({cancel(){cancelled=true;}})),true);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'ak','en'),(error:any)=>{
    assert.equal(error.stage,'recognition');assert.equal(error.status,504);
    assert.match(error.message,/timed out while recognizing/);return true;
  });
  assert.equal(f.requests.length,1);assert.ok(cancelled);
});
test('cancellation before processing, unsupported dialect MT and excessive duration never spend credits',async()=>{
  const f=fixture(),abort=new AbortController();abort.abort();
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'en','ak',abort.signal),(error:any)=>error.status===499);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(),'tw-ak','en'),(error:any)=>error.status===422);
  await assert.rejects(()=>f.api.processStagedVoiceNote(wav(61),'en','ak'),(error:any)=>error.status===400);
  assert.equal(f.requests.length,0);
});
