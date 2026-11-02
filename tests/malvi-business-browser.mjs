import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';
import { applyBusinessCommand } from '../src/server/assistant/businessRooms.ts';

// Actual React workspace and client, isolated fixture HTTP data. No production
// auth changes, provider sessions, payments, customer data or microphone capture.
const roomId = '11111111-1111-4111-8111-111111111111';
const baseline = () => ({
  id: roomId, ownerId: 'fixture-owner', topic: 'Browser fixture team', objective: 'Verify real controls',
  members: [{ id: 'fixture-owner', name: 'Fixture Owner' }], version: 1, messages: [], actions: [],
  knowledge: [], summary: '', summaryThrough: null, meetingOpen: false, updatedAt: new Date().toISOString(),
});
let room = baseline(), failed = false, mediaRequests = 0;
const entry = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {MalviBusinessCollaborationRoom} from './src/components/malvi/MalviBusinessCollaborationRoom';
import {BusinessLiveTranslation} from './src/services/businessLiveTranslation';
window.__groupProbe=async()=>{
 const callbacks=new Map(),sent=[],remote=[],errors=[];
 const emit=(event,p)=>[...(callbacks.get(event)||[])].forEach(fn=>fn(p));
 const transport={on:(event,fn)=>{const list=callbacks.get(event)||new Set();list.add(fn);callbacks.set(event,list);return()=>list.delete(fn);},
  send:(event,p)=>{sent.push(event);if(event==='langpretation:business_listen')emit('langpretation:business_ready',{callId:p.callId,targetLanguage:'en'});return true;}};
 const id='business:11111111-1111-4111-8111-111111111111';
 const service=new BusinessLiveTranslation({roomId:id.slice(9),userId:'fixture-owner',targetLanguage:'en',
 onRemote:(uid,active)=>remote.push([uid,active]),onError:e=>errors.push(e),onState:()=>{},onTranscript:()=>{}},transport);
 await service.listen();
 for(const [speaker,uid] of [['first',101],['second',102]]){
  emit('langpretation:remote_start',{callId:id,speakerId:speaker,speakerRtcUid:uid,streamId:speaker,sequence:0});
  emit('langpretation:audio_out',{callId:id,speakerId:speaker,streamId:speaker,sequence:0,data:btoa(String.fromCharCode(0,0,0,0))});
 }
 emit('langpretation:audio_out',{callId:id,speakerId:'first',streamId:'first',sequence:2,data:btoa(String.fromCharCode(0,0))});
 emit('langpretation:remote_stop',{callId:id,speakerId:'second',streamId:'second'});
 service.dispose();
 return {remote,errors:errors.length,acknowledgements:sent.filter(e=>e==='langpretation:receiver_ready').length,
  unsubscribed:sent.includes('langpretation:business_leave'),listeners:[...callbacks.values()].reduce((n,s)=>n+s.size,0)};
};
localStorage.setItem('nanivio_auth_token','isolated-fixture-token');
createRoot(document.getElementById('root')).render(<MalviBusinessCollaborationRoom/>);`;
const bundle = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-context', setup(api) {
    api.onResolve({ filter: /NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const useNanivio=()=>({
      currentUser:{id:'fixture-owner',name:'Fixture Owner',myLanguage:'en'},
      malviSubscription:{tier:'malvi_business',status:'ACTIVE',currentPeriodStart:0,currentPeriodEnd:4102444800000}
    });`, loader: 'js' }));
  } }],
});
const css = (await Promise.all((await readdir('dist/assets')).filter(f => f.endsWith('.css')).map(f => readFile(`dist/assets/${f}`, 'utf8')))).join('\n');
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
  if (req.url.startsWith('/api/')) {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    let output;
    if (req.url.endsWith('/token')) { mediaRequests++; res.statusCode = 503; output = { success: false, error: 'Provider not called in isolated UI checks.' }; }
    else if (req.url.endsWith('/command')) {
      room = applyBusinessCommand(room, 'fixture-owner', body); room.version++; output = { success: true, room };
    } else if (req.url.endsWith('/assist')) {
      if (failed) { res.statusCode = 503; output = { success: false, error: 'Fixture inference failed. No response was generated.' }; }
      else {
        room.summary = 'Fixture-only grounded summary of the saved idea.'; room.version++;
        room.messages.push({ id: `assistant-${room.version}`, authorId: 'malvi', author: 'Malvi', kind: 'assistant', text: room.summary, at: Date.now() });
        output = { success: true, room };
      }
    } else if (req.url.endsWith('/rooms')) output = { success: true, rooms: [room] };
    else output = { success: true, room };
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(output));
  }
  res.setHeader('content-type', 'text/html');
  res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0;background:#202321;padding:12px"><main id="root"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    room = baseline(); failed = false;
    const page = await browser.page(base);
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await page.wait("document.body.innerText.includes('Browser fixture team')");
    await page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Browser fixture team')).click();true");
    await page.wait("!!document.querySelector('textarea[placeholder]')");
    assert.equal(await page.evaluate('document.documentElement.scrollWidth>innerWidth'), false, `Workspace overflow at ${width}`);
    await page.evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Fixture decision: run the pilot.');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await page.evaluate("document.querySelector('textarea').closest('form').requestSubmit();true");
    await page.wait("document.body.innerText.includes('Fixture decision: run the pilot.')");
    assert.equal(room.messages[0].authorId, 'fixture-owner');
    await page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Summarize').click();true");
    await page.wait("document.body.innerText.includes('Fixture-only grounded summary')");
    const before = room.messages.length;
    failed = true;
    await page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Analyze').click();true");
    await page.wait("document.querySelector('[role=alert]')?.textContent.includes('Fixture inference failed')");
    assert.equal(room.messages.length, before, 'Failure must not insert a canned success response.');
  }
  assert.equal(mediaRequests, 0);
  const playbackPage = await browser.page(base);
  await playbackPage.wait('typeof window.__groupProbe==="function"');
  const playback = await playbackPage.command('Runtime.evaluate', { expression: 'window.__groupProbe()', awaitPromise: true, returnByValue: true, userGesture: true });
  assert.equal(playback.exceptionDetails, undefined);
  const result = playback.result.value;
  assert.equal(result.acknowledgements, 2);
  assert.ok(result.remote.some(([uid,active])=>uid===101&&active) && result.remote.some(([uid,active])=>uid===102&&active));
  assert.ok(result.remote.some(([uid,active])=>uid===101&&!active) && result.remote.some(([uid,active])=>uid===102&&!active));
  assert.equal(result.errors, 1); assert.equal(result.listeners, 0); assert.equal(result.unsubscribed, true);
  console.log(JSON.stringify({ passed: true, actualWorkspaceComponent: true, viewports: 2, persistedFixtureMessage: true, summary: true, noCannedFallback: true, providerRequests: 0 }));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
