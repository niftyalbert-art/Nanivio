import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

async function fixture(responses: { status:number; body:unknown }[]) {
  const calls: any[] = [];
  const bundle = await build({
    entryPoints:['src/services/callTranslationReadiness.ts'], bundle:true, write:false, platform:'node', format:'cjs',
    plugins:[{name:'authenticated-fixture', setup(builder) {
      builder.onResolve({filter:/authenticatedFetch$/}, () => ({path:'fetch',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'}, () => ({contents:'export const authenticatedFetch = globalThis.__callReadinessFetch;'}));
    }}],
  });
  (globalThis as any).__callReadinessFetch = async (url:string, options:any) => {
    calls.push({url,options});
    const next = responses.shift(); assert.ok(next, 'No unexpected retries');
    return Response.json(next.body, {status:next.status});
  };
  const module = {exports:{} as any};
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return {wait:module.exports.waitForCallTranslation, calls};
}
test('waits for call-meter startup only, before starting any paid inference', async () => {
  const f = await fixture([{status:425,body:{code:'CALL_STARTING'}},{status:200,body:{success:true}}]);
  await f.wait('call-one','en','ak',new AbortController().signal);
  assert.equal(f.calls.length,2);
  assert.match(f.calls[0].url, /callId=call-one&sourceLang=en&targetLang=ak/);
});
test('quota, permission, configuration, and changed-pair failures do not retry', async () => {
  for (const status of [402,403,409,429,503]) {
    const f = await fixture([{status,body:{error:'Cannot start fixture'}}]);
    await assert.rejects(f.wait('call-one','en','fr',new AbortController().signal), /Cannot start fixture/);
    assert.equal(f.calls.length,1);
  }
});
test('leaving a call cancels its pending readiness wait', async () => {
  const f = await fixture([{status:425,body:{code:'CALL_STARTING'}}]);
  const controller=new AbortController();
  const pending = f.wait('call-one','en','fr',controller.signal);
  controller.abort();
  await assert.rejects(pending, /stopped/);
  assert.equal(f.calls.length,1);
});
test('call switch activates capture and specialist flow forwards raw microphone WAV, not a client transcript', () => {
  const view=readFileSync('src/components/calls/VideoCallScreen.tsx','utf8');
  assert.match(view,/activeCall\.langpretationEnabled && !host\.isMuted && !translationPaused/);
  assert.match(view,/void startTranslation\(\)/);
  assert.match(view,/await waitForCallTranslation/);
  assert.match(view,/processLiveSpeechUtterance\(host\.id,'',\{audioBase64,signal\}\)/);
  assert.match(view,/'LISTENING' : 'NOT LISTENING'/);
  assert.match(view,/inputStream:agoraClient\.getLocalStream/);
});
