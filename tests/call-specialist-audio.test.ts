import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPalabraCallHandler, stagedCallPairConfigured } from '../src/server/palabraCallRoute';
import { SpeechProviderError } from '../src/server/speechProviders';
import { VoiceNoteProcessingError } from '../src/server/voiceNotePipeline';
import {buildPeerCallCaption,isIncomingCallCaption} from '../src/shared/callCaption';

function wav() {
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const handler = createPalabraCallHandler({
    userId: () => 'authenticated-speaker',
    authorize: async () => { calls.push('authorize'); },
    stagedConfigured: () => true,
    configured: () => { throw new Error('Specialist calls must not require Palabra'); },
    stagedTranslate: (async (audio: Buffer, source: string, target: string, signal: AbortSignal) => {
      calls.push('speech');
      assert.equal(audio.toString('hex'), wav().toString('hex'));
      assert.equal(source, 'en'); assert.equal(target, 'ak');
      assert.equal(signal.aborted, false);
      return { transcript: 'fixture speech', translatedTranscript: 'fixture translation',
        audioBase64: wav().toString('base64'), contentType:'audio/wav', durationSeconds:0.5 };
    }) as any,
    ...overrides,
  });
  const req: any = Object.assign(new EventEmitter(), { body: {
    sessionId:'connected-call', sourceLang:'en', targetLang:'ak', audioBase64:wav().toString('base64'),
  } });
  const res: any = Object.assign(new EventEmitter(), { code:200, body:null,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  });
  return { handler, req, res, calls };
}
test('specialist calls send actual microphone audio through the pair-aware pipeline after authorization', async () => {
  const f = fixture(); await f.handler(f.req, f.res);
  assert.deepEqual(f.calls, ['authorize', 'speech']);
  assert.equal(f.res.code, 200); assert.equal(f.res.body.success, true);
  assert.equal(f.res.body.text, 'fixture speech');
  assert.equal(f.res.body.translatedText, 'fixture translation');
  assert.ok(f.res.body.audioBase64);
});
test('denied calls cannot invoke specialist recognition, translation, or synthesis', async () => {
  const f = fixture({ authorize: async () => { throw new Error('Denied'); } });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 503); assert.deepEqual(f.calls, []);
});
test('a malformed authenticated probe identifies the diagnostics release without invoking providers',async()=>{
  const f=fixture();f.req.body={};
  await f.handler(f.req,f.res);
  assert.equal(f.res.code,400);
  assert.equal(f.res.body.diagnosticsVersion,1);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.res.body.support,undefined);
});
test('missing specialist configuration is explicit and never silently changes provider', async () => {
  const f = fixture({ stagedConfigured: () => false });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 503); assert.deepEqual(f.calls, ['authorize']);
  assert.match(f.res.body.error, /not configured/);
});
test('unknown languages and same-language calls cannot spend speech credits', async () => {
  for (const target of ['xx', 'en']) {
    const f = fixture(); f.req.body.targetLang = target;
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 400); assert.deepEqual(f.calls, []);
  }
});
test('specialist speech failures return a safe error rather than success or a synthetic fallback', async () => {
  const f = fixture({ stagedTranslate: async () => { throw new SpeechProviderError(504, 'Speech timed out.'); } });
  await f.handler(f.req, f.res);
  assert.equal(f.res.code, 504); assert.equal(f.res.body.success, false);
  assert.equal(f.res.body.audioBase64, undefined);
});
test('live speech failures identify only the failed stage, without exposing provider metadata', async () => {
  for (const stage of ['recognition','translation','synthesis'] as const) {
    const cause = new SpeechProviderError(504,'private provider response',{
      operation:'text',model:'private-model',apiVersion:'v1beta',failure:'timeout',
    });
    const error = new VoiceNoteProcessingError(stage,cause);
    const f = fixture({stagedTranslate:async()=>{throw error;}});
    await f.handler(f.req,f.res);
    assert.equal(f.res.code,504);
    assert.equal(f.res.body.success,false);
    assert.equal(f.res.body.stage,stage);
    assert.equal(f.res.body.code,`LIVE_SPEECH_${stage.toUpperCase()}_FAILED`);
    assert.deepEqual(f.res.body.support,{failure:'timeout',provider:'gemini'});
    assert.doesNotMatch(JSON.stringify(f.res.body),/private provider response|private-model/);
    assert.equal(f.res.body.diagnostic,undefined);
    assert.equal(f.res.body.audioBase64,undefined);
  }
});
test('service-limit errors retain their actionable code together with the failed stage',async()=>{
  const cause = new SpeechProviderError(503,'private response',undefined,{
    provider:'khaya',operation:'recognition',upstreamHttpStatus:403,failure:'limit',
  });
  const f=fixture({stagedTranslate:async()=>{throw new VoiceNoteProcessingError('recognition',cause);}});
  await f.handler(f.req,f.res);
  assert.equal(f.res.code,503);
  assert.equal(f.res.body.code,'SPEECH_SERVICE_LIMIT');
  assert.equal(f.res.body.stage,'recognition');
  assert.deepEqual(f.res.body.support,{failure:'limit',provider:'khaya',upstreamStatus:403});
  assert.equal(f.res.body.upstreamDiagnostic,undefined);
});
test('live failure support metadata rejects unknown providers, arbitrary model values and extra fields',async()=>{
  for(const model of ['gemini-fixture-model','https://private.invalid/key','private-provider-token']){
    const error=new VoiceNoteProcessingError('recognition',new SpeechProviderError(503,'private response',{
      model,operation:'text',apiVersion:'v1beta',upstreamHttpStatus:401,
    }));
    Object.assign(error.diagnostic!,{credentials:'private secret',text:'private conversation'});
    const f=fixture({stagedTranslate:async()=>{throw error;}});
    await f.handler(f.req,f.res);
    assert.deepEqual(f.res.body.support,{
      failure:'configuration',provider:'gemini',upstreamStatus:401,
      ...(model==='gemini-fixture-model'?{model}:{}),
    });
    assert.doesNotMatch(JSON.stringify(f.res.body),/private secret|private conversation|private.invalid|private-provider-token/);
  }
});
test('one specialist phrase per account is enforced and released after processing stops', async () => {
  let finish!:()=>void;
  const first = fixture({ stagedTranslate: async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    throw new SpeechProviderError(499, 'Stopped.');
  } });
  const pending = first.handler(first.req, first.res);
  await new Promise(resolve => setImmediate(resolve));
  const second = fixture();
  await second.handler(second.req, second.res);
  assert.equal(second.res.code,429);
  assert.deepEqual(second.calls,['authorize']);
  finish(); await pending;
  const next = fixture(); await next.handler(next.req,next.res);
  assert.equal(next.res.code,200);
});
test('Twi–English combined readiness does not depend on Gemini credentials', t => {
  const keys = ['GEMINI_API_KEY', 'KHAYA_API_KEY'] as const;
  const saved = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  }));
  delete process.env.GEMINI_API_KEY; process.env.KHAYA_API_KEY = 'fixture-only';
  assert.equal(stagedCallPairConfigured('en', 'ak'), true);
  assert.equal(stagedCallPairConfigured('ak', 'en'), true);
  assert.equal(stagedCallPairConfigured('en', 'tw-ak'), false);
  process.env.GEMINI_API_KEY='fixture-only';
  assert.equal(stagedCallPairConfigured('en','tw-ak'),true);
});
test('only authorized provider-generated captions are exposed before spoken output',async()=>{
  const captions:any[]=[],events:string[]=[];
  const f=fixture({
    authorize:async()=>{events.push('authorize');},
    caption:(...args:any[])=>{events.push('caption');captions.push(args);},
    stagedTranslate:async(_audio:Buffer,_source:string,_target:string,_signal:AbortSignal,onTranslated:any)=>{
      onTranslated({transcript:'Original',translatedTranscript:'Translated'});
      events.push('synthesis');
      return {transcript:'Original',translatedTranscript:'Translated',audioBase64:wav().toString('base64')};
    },
  });
  await f.handler(f.req,f.res);
  assert.deepEqual(events,['authorize','caption','synthesis']);
  assert.deepEqual(captions[0],['authenticated-speaker','connected-call','en','ak',
    {transcript:'Original',translatedTranscript:'Translated'}]);
});

test('early captions precede the audio response and are delivered exactly once',async()=>{
  let complete!:(value:any)=>void;
  const captions:any[]=[];
  const f=fixture({caption:(...args:any[])=>captions.push(args),
    stagedTranslate:async(_audio:Buffer,_source:string,_target:string,_signal:AbortSignal,onTranslated:any)=>{
      onTranslated({transcript:'Original',translatedTranscript:'Translated'});
      return new Promise(resolve=>{complete=resolve;});
    }});
  const pending=f.handler(f.req,f.res);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(captions.length,1);assert.equal(f.res.body,null);
  complete({transcript:'Original',translatedTranscript:'Translated',audioBase64:wav().toString('base64')});
  await pending;
  assert.equal(captions.length,1);assert.equal(f.res.body.success,true);
});
test('full-file results also deliver one caption and expose only numeric overall server timing',async()=>{
  const captions:any[]=[],headers:Record<string,string>={};
  const f=fixture({caption:(...args:any[])=>captions.push(args)});
  f.res.setHeader=(key:string,value:string)=>{headers[key]=value;};
  await f.handler(f.req,f.res);
  assert.equal(captions.length,1);
  assert.equal(captions[0][4].translatedTranscript,'fixture translation');
  assert.match(headers['Server-Timing'],/^langpretation;dur=\d+$/);
  assert.equal(f.res.body.success,true);
});
test('caption transport errors do not discard successful translated audio or invoke providers again',async()=>{
  let attempts=0;const warn=console.warn;console.warn=()=>{};
  try{
    const f=fixture({caption:()=>{attempts++;throw new Error('private transport detail');}});
    await f.handler(f.req,f.res);
    assert.equal(attempts,1);assert.equal(f.res.body.success,true);
    assert.deepEqual(f.calls,['authorize','speech']);
    assert.doesNotMatch(JSON.stringify(f.res.body),/private transport detail/);
  }finally{console.warn=warn;}
});
test('disconnect during processing suppresses late captions and the audio response',async()=>{
  let complete!:(value:any)=>void,onTranslated!:(value:any)=>void;
  const captions:any[]=[];
  const f=fixture({caption:(...args:any[])=>captions.push(args),
    stagedTranslate:async(_a:Buffer,_s:string,_t:string,_signal:AbortSignal,callback:any)=>{
      onTranslated=callback;return new Promise(resolve=>{complete=resolve;});
    }});
  const pending=f.handler(f.req,f.res);await new Promise(resolve=>setImmediate(resolve));
  f.res.emit('close');
  onTranslated({transcript:'Late',translatedTranscript:'Late translation'});
  complete({transcript:'Late',translatedTranscript:'Late translation',audioBase64:wav().toString('base64')});
  await pending;
  assert.equal(captions.length,0);assert.equal(f.res.body,null);
});
test('simultaneous Arabic and Twi turns deliver only the other speaker’s caption in each listening language',async()=>{
  const session={callId:'connected-call',status:'connected',participants:['arabic-speaker','twi-speaker']};
  const view={id:session.callId,status:'connected',langpretationEnabled:true,
    participants:[{id:'arabic-speaker',myLanguage:'ar'},{id:'twi-speaker',myLanguage:'ak'}]};
  const received=new Map<string,any>();
  const tasks=[['arabic-speaker','ar','ak','Twi translation'],['twi-speaker','ak','ar','ترجمة عربية']]
    .map(([speaker,source,target,translated])=>{
      const f=fixture({
        userId:()=>speaker,
        authorize:async(id:string,callId:string)=>{
          assert.ok(session.participants.includes(id));assert.equal(callId,session.callId);
        },
        caption:(userId:string,callId:string,from:string,to:string,value:any)=>{
          assert.equal(callId,session.callId);
          const delivery=buildPeerCallCaption(session,userId,from,to,value);
          assert.ok(delivery);
          assert.equal(isIncomingCallCaption(view,delivery.payload,delivery.recipientId),true);
          assert.notEqual(delivery.recipientId,userId);
          received.set(delivery.recipientId,delivery.payload);
        },
        stagedTranslate:async(_a:Buffer,_s:string,_t:string,_signal:AbortSignal,onTranslated:any)=>{
          const caption={transcript:'Original '+source,translatedTranscript:translated};
          onTranslated(caption);
          await new Promise(resolve=>setImmediate(resolve));
          return {...caption,audioBase64:wav().toString('base64')};
        },
      });
      f.req.body.sourceLang=source;f.req.body.targetLang=target;
      return f.handler(f.req,f.res).then(()=>assert.equal(f.res.body.success,true));
    });
  await Promise.all(tasks);
  assert.equal(received.size,2);
  assert.equal(received.get('arabic-speaker').translatedText,'ترجمة عربية');
  assert.equal(received.get('twi-speaker').translatedText,'Twi translation');
});
