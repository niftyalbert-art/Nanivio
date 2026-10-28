// Real UI, isolated transport/auth/billing fixtures. No main-app auth bypass,
// provider session, audio synthesis, customer record or paid API call.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const mocks = {
  context: `export const useNanivio=()=>({currentUser:{id:'fixture-user',appLanguage:'en'},appLanguage:'en',setAppLanguage:()=>{}});`,
  auth: `export const authClient={getToken:()=> 'fixture-only'};`,
  realtime: `const listeners=new Map();export const realtimeClient={
    connect(){},send(type,payload){(window.__sent ||= []).push({type,payload});
      if(type==='malvi:brain_start')queueMicrotask(()=>{for(const h of listeners.get('malvi:brain_ready')||[])h({...payload,speechProvider:'gemini'});});return true;},
    on(type,handler){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(handler);return ()=>listeners.get(type)?.delete(handler);}
  }; window.__drop=()=>{for(const h of listeners.get('connection:lost')||[])h({});};`,
  playback: `export class MalviVoicePlayback{async resume(){}close(){}stop(){}pause(){}async play(){}}`,
  billing: `export async function protectedBillingRequest(url,init){const r=await fetch(url,{...init,headers:{'Content-Type':'application/json'}});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}`,
};
const bundle = await build({
  stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';
    import{MalviLiveAssistantProvider,MalviLiveControls}from'./src/components/malvi/MalviLiveAssistant.tsx';
    import{AdminMalviRuntimeLimits}from'./src/components/admin/AdminMalviRuntimeLimits.tsx';
    createRoot(document.getElementById('root')).render(location.pathname==='/admin'?<AdminMalviRuntimeLimits/>:<MalviLiveAssistantProvider><MalviLiveControls/></MalviLiveAssistantProvider>);`,
    resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent',loader:{'.png':'dataurl','.jpg':'dataurl'},
  plugins:[{name:'isolated-readiness',setup(b){
    for(const [pattern,name] of [[/context\/NanivioContext$/,'context'],[/lib\/authClient$/,'auth'],[/lib\/realtimeClient$/,'realtime'],[/lib\/malviVoicePlayback$/,'playback'],[/lib\/billingClient$/,'billing']]){
      b.onResolve({filter:pattern},()=>({path:name,namespace:'fixture'}));
    }
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const cssFile=(await fs.readdir('dist/assets')).find(f=>f.endsWith('.css'));
const css=await fs.readFile('dist/assets/'+cssFile,'utf8');
const app=express();app.use(express.json());
let starts=0,ends=0,saves=0,readOnly=false;
let policy={version:0,live_minutes_monthly:null,research_monthly:null,analyses_monthly:null,upload_mib_monthly:null};
app.get('/bundle.js',(_q,r)=>r.type('js').send(bundle.outputFiles[0].text));
app.get('/fixture.css',(_q,r)=>r.type('css').send(css));
app.get('/api/assistant/status',(_q,r)=>r.json({success:true,enabled:true,configured:false,voiceAvailable:true,brainConfigured:true,
  canRunSetupTests:false,canManageVoice:false,missing:[],speech:{provider:'gemini',configured:true,supportedLanguages:['en']}}));
app.post('/api/assistant/voice',(_q,r)=>{
  starts++;const now=Date.now();
  r.status(201).json({success:true,id:'fixture-'+starts,mode:'VOICE_ONLY',language:'en',serverNow:now,idleDeadline:now+60000,hardDeadline:now+120000});
});
app.post('/api/assistant/session/:id/end',(_q,r)=>{ends++;r.json({success:true});});
app.get('/api/admin/billing/malvi-runtime',(_q,r)=>r.json({success:true,canEdit:!readOnly,policy}));
app.post('/api/admin/billing/malvi-runtime/save',(q,r)=>{saves++;policy={...q.body,version:policy.version+1};r.json({success:true,policy});});
app.use('/api',(_q,r)=>r.status(404).json({success:false,error:'Unexpected fixture API request'}));
app.use((_q,r)=>r.type('html').send('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;padding:12px;background:#080e18;color:white"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>'));
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const browser=await launchBrowser();
try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  const page=await browser.page(origin);
  await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await page.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Start voice')&&!b.disabled)");
  assert.equal(await page.evaluate("document.body.innerText.includes('Test voice only · admin')"),false);
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Start voice')).click()");
  await page.wait("document.body.innerText.includes('Voice connected')");
  assert.equal(starts,1);
  await page.evaluate('window.__drop()');
  await page.wait("document.body.innerText.includes('Start a new conversation')");
  assert.equal(starts,1,'a dropped transport never automatically starts another paid session');
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start a new conversation').click()");
  await page.wait("(window.__sent||[]).filter(e=>e.type==='malvi:brain_start').length===2");
  assert.equal(starts,2);
  assert.ok(ends>=1,'old session cleanup happens before explicit restart');
  assert.equal(await page.evaluate("(window.__sent||[]).some(e=>e.type==='malvi:mic_audio')"),false,'old microphone input is not replayed');
  const admin=await browser.page(origin+'/admin');
  await admin.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await admin.wait("document.querySelectorAll('input[type=number]').length===4 && !document.querySelector('input[type=number]').disabled");
  await admin.evaluate(`(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    document.querySelectorAll('input[type=number]').forEach((el,i)=>{set.call(el,['0','4','4','2'][i]);el.dispatchEvent(new Event('input',{bubbles:true}));});
    const el=document.querySelector('input[maxlength=\"500\"]');set.call(el,'Fixture reviewed provider limits');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await admin.wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Save usage limits'&&!b.disabled)");
  await admin.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save usage limits').click()");
  await admin.wait("document.body.innerText.includes('Usage limits saved')");
  assert.equal(saves,1);assert.equal(policy.live_minutes_monthly,0);
  assert.ok(await admin.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile form must not overflow horizontally');
  readOnly=true;
  const viewer=await browser.page(origin+'/admin');
  await viewer.wait("document.querySelectorAll('input[type=number]').length===4");
  assert.ok(await viewer.evaluate("Array.from(document.querySelectorAll('input')).every(e=>e.disabled)"),'read-only roles cannot edit usage caps');
  console.log(JSON.stringify({customerVoiceNoAvatar:true,explicitRestartOnly:true,noMicReplay:true,mobileAdminUsageCaps:true,readOnly:true}));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
