import test from 'node:test';
import assert from 'node:assert/strict';
import {translateWithProductionProviders} from '../src/server/translationRouter.ts';
import {SpeechProviderError} from '../src/server/speechProviders.ts';
import {VoiceNoteProcessingError} from '../src/server/voiceNotePipeline.ts';

test('speech translation preserves a provider quota failure; ordinary text callers retain their contract',async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  let requests=0;
  process.env.GEMINI_API_KEY='test-only-placeholder';
  globalThis.fetch=(async()=>{
    requests++;
    return new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED',message:'private upstream body'}}),
      {status:429,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try{
    assert.equal(await translateWithProductionProviders('test phrase','ar','en'),null);
    await assert.rejects(translateWithProductionProviders('test phrase','ar','en',undefined,
      {preserveProviderErrors:true}),(error:unknown)=>{
      assert.ok(error instanceof SpeechProviderError);
      assert.equal(error.code,'SPEECH_SERVICE_LIMIT');
      assert.equal(error.diagnostic?.upstreamHttpStatus,429);
      assert.doesNotMatch(error.message,/private upstream body/);
      const wrapped=new VoiceNoteProcessingError('translation',error);
      assert.equal(wrapped.stage,'translation');
      assert.equal(wrapped.code,'SPEECH_SERVICE_LIMIT');
      assert.match(wrapped.message,/service limit/i);
      return true;
    });
    assert.equal(requests,2,'quota failures must not be retried');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});

test('authentication and unknown-model failures remain configuration errors, not customer-minute exhaustion',()=>{
  for(const status of [401,403,404]){
    const error=new SpeechProviderError(503,'private message',{
      operation:'text',model:'test-model',apiVersion:'v1beta',upstreamHttpStatus:status,
    });
    assert.equal(error.code,'SPEECH_SERVICE_CONFIGURATION');
    assert.equal(new VoiceNoteProcessingError('recognition',error).code,'SPEECH_SERVICE_CONFIGURATION');
  }
});

test('Khaya translation failures retain their status and provider only for strict speech callers',async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.KHAYA_API_KEY,originalUrl=process.env.KHAYA_TRANSLATION_URL;
  process.env.KHAYA_API_KEY='test-only-placeholder';
  process.env.KHAYA_TRANSLATION_URL='https://fixture.invalid/v2/translate';
  const cases=[
    {status:429,body:'private upstream body',failure:'limit',code:'SPEECH_SERVICE_LIMIT'},
    {status:403,body:'Out of call volume quota.',failure:'limit',code:'SPEECH_SERVICE_LIMIT'},
    {status:403,body:'Access denied.',failure:'authorization',code:'SPEECH_SERVICE_CONFIGURATION'},
    {status:401,body:'Invalid key.',failure:'authentication',code:'SPEECH_SERVICE_CONFIGURATION'},
    {status:404,body:'Not found.',failure:'configuration',code:'SPEECH_SERVICE_CONFIGURATION'},
    {status:500,body:'private upstream body',failure:'upstream',code:undefined},
    {status:200,body:'{}',failure:'invalid_response',code:undefined},
  ];
  try{
    for(const row of cases){
      let requests=0;
      globalThis.fetch=(async()=>{requests++;return new Response(row.body,{status:row.status});}) as typeof fetch;
      assert.equal(await translateWithProductionProviders('fixed fixture phrase','ak','en'),null);
      await assert.rejects(translateWithProductionProviders('fixed fixture phrase','ak','en',undefined,
        {preserveProviderErrors:true}),(error:unknown)=>{
        assert.ok(error instanceof SpeechProviderError);
        assert.equal(error.code,row.code);
        assert.equal(error.upstreamDiagnostic?.failure,row.failure);
        assert.equal(error.upstreamDiagnostic?.upstreamHttpStatus,row.status);
        assert.equal(error.upstreamDiagnostic?.provider,'khaya');
        assert.doesNotMatch(error.message,/private upstream body|fixed fixture phrase/);
        return true;
      });
      assert.equal(requests,2,'errors never spend credits on retries');
    }
    globalThis.fetch=(async()=>{throw new DOMException('private transport data','TimeoutError');}) as typeof fetch;
    await assert.rejects(translateWithProductionProviders('fixed fixture phrase','ak','en',undefined,
      {preserveProviderErrors:true}),(error:unknown)=>{
      assert.ok(error instanceof SpeechProviderError);
      assert.equal(error.status,504);
      assert.equal(error.upstreamDiagnostic?.failure,'timeout');
      assert.doesNotMatch(error.message,/private transport data/);
      return true;
    });
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.KHAYA_API_KEY;else process.env.KHAYA_API_KEY=originalKey;
    if(originalUrl===undefined)delete process.env.KHAYA_TRANSLATION_URL;else process.env.KHAYA_TRANSLATION_URL=originalUrl;
  }
});
