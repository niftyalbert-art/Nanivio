import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { launchBrowser } from './cdp.mjs';

// Real React components and lifecycle, isolated SDK/HTTP fixtures only.
// This is NOT evidence of a real provider stream or a signed-in production UI.
const output = 'generated-artifacts/malvi-avatar-fixture.js';
const source = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import {MalviLiveAssistantProvider,MalviLiveControls} from './src/components/malvi/MalviLiveAssistant';
import {MalviStage3DVisual} from './src/components/malvi/MalviStage3DVisual';
const element=document.createElement('div');
element.id='malvi-avatar-fixture';
element.style.cssText='position:fixed;inset:0;z-index:80;overflow:auto;background:#070d18;padding:24px;color:white';
document.body.appendChild(element);
const root=ReactDOM.createRoot(element);
let version=0;
const originalFetch=window.fetch.bind(window);
const originalNow=Date.now;
Date.now=()=>originalNow()+window.__clockOffset;
HTMLMediaElement.prototype.play=async()=>{};
HTMLMediaElement.prototype.pause=()=>{};
window.__clockOffset=0;
window.__fixtureActions=[];
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);
 if(!url.pathname.startsWith('/api/assistant/'))return originalFetch(input,init);
 const path=url.pathname.slice('/api/assistant'.length);
 const body=init.body?JSON.parse(init.body):null;
 window.__fixtureActions.push({path,body});
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(path==='/status')return json({success:true,configured:window.__configured,enabled:true,
  missing:window.__configured?[]:['HEYGEN_API_KEY','AVATAR_ID','REDIS_URL'],brainConnected:false,welcomeVoiceConfigured:false});
 if(path==='/session'){
  if(window.__holdHandshake)await new Promise(resolve=>window.__releaseHandshake=resolve);
  return json({success:true,id:'11111111-1111-1111-1111-111111111111',sessionToken:'fixture-only-not-a-real-token',
   idleDeadline:Date.now()+60000,hardDeadline:Date.now()+600000},201);
 }
 if(path.endsWith('/welcome'))return json({success:false,error:'Backend welcome voice is not configured. Brain upgrade next.'},503);
 if(path.endsWith('/activity'))return json({success:true,idleDeadline:Date.now()+60000});
 if(path.endsWith('/end'))return json({success:true});
 throw new Error('Unexpected fixture request '+path);
};
window.__mountMalviFixture=async(configured=true)=>{
 root.render(null);await new Promise(resolve=>setTimeout(resolve,40));
 window.__fixtureActions=[];window.__clockOffset=0;window.__configured=configured;
 window.__holdHandshake=false;window.__sdkStarts=0;window.__sdkStops=0;window.__sdkMicOpens=0;window.__mode='LITE';
 root.render(React.createElement(MalviLiveAssistantProvider,{key:++version},
  React.createElement(MalviLiveControls),
  React.createElement('div',{style:{maxWidth:560,margin:'0 auto'}},
   React.createElement(MalviStage3DVisual,{state:'idle',isListening:false,isProcessing:false,
    currentlySpeakingText:null,interimTranscript:'',voiceSpeechEnabled:false,handsFreeMode:false,speechRate:1,
    onToggleMic:()=>{},onInterrupt:()=>{},onToggleVoice:()=>{},onToggleHandsFree:()=>{},
    onChangeSpeechRate:()=>{},onQuickPrompt:()=>{},onToggleImmersive:()=>{}}))));
};
`;
const sdkFixture = `
export const SessionEvent={SESSION_STREAM_READY:'ready',SESSION_DISCONNECTED:'disconnected'};
export const SessionMode={LITE:'LITE',FULL:'FULL'};
export class LiveAvatarSession{
 constructor(){this.mode=window.__mode;this.handlers={};this.connected=false;
  this.voiceChat={start:async()=>{window.__sdkMicOpens++},stop:()=>{}};}
 on(name,fn){this.handlers[name]=fn;}
 async start(){window.__sdkStarts++;await this.voiceChat.start();this.connected=true;this.handlers.ready?.();}
 attach(video){video.dataset.fixtureStream='true';window.__fixtureActions.push({path:'sdk-attach'});}
 async stop(){if(this.connected){this.connected=false;window.__sdkStops++;this.handlers.disconnected?.();}}
 interrupt(){window.__fixtureActions.push({path:'sdk-interrupt'});}
 repeatAudio(){window.__fixtureActions.push({path:'sdk-audio'});}
}
`;
await fs.mkdir('generated-artifacts', { recursive: true });
await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: output, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{
    name: 'isolated-malvi-fixtures',
    setup(builder) {
      builder.onResolve({ filter: /\/NanivioContext$/ }, () => ({ path: 'fixture-context', namespace: 'fixture' }));
      builder.onLoad({ filter: /fixture-context/, namespace: 'fixture' }, () => ({ contents: 'export const useNanivio=()=>({currentUser:{id:"fixture-account"}});' }));
      builder.onResolve({ filter: /\/authClient$/ }, () => ({ path: 'fixture-auth', namespace: 'fixture' }));
      builder.onLoad({ filter: /fixture-auth/, namespace: 'fixture' }, () => ({ contents: 'export const authClient={getToken:()=>"fixture-only"};' }));
      builder.onResolve({ filter: /^@heygen\/liveavatar-web-sdk$/ }, () => ({ path: 'fixture-sdk', namespace: 'fixture' }));
      builder.onLoad({ filter: /fixture-sdk/, namespace: 'fixture' }, () => ({ contents: sdkFixture }));
      builder.onResolve({ filter: /^react(?:\/jsx-runtime|\/jsx-dev-runtime)?$|^react-dom(?:\/client)?$/ }, args => ({ path: args.path, namespace: 'react-cjs' }));
      builder.onLoad({ filter: /.*/, namespace: 'react-cjs' }, args => {
        const name = args.path.replaceAll('/', '_');
        return { contents: `import value from '/node_modules/.vite/deps/${name}.js';module.exports=value;`, loader: 'js' };
      });
      builder.onResolve({ filter: /^\/node_modules\/\.vite\/deps\// }, args => ({ path: args.path, external: true }));
    },
  }],
});
const browser = await launchBrowser();
try {
  const page = await browser.page('http://127.0.0.1:5000/');
  page.evaluate = async expression => {
    const result = await page.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = page.wait.bind(page);
  page.wait = async (...args) => {
    try { await wait(...args); }
    catch (error) {
      console.error('Fixture state:', await page.evaluate(`({
        text:document.querySelector('[role="dialog"]')?.textContent ?? document.getElementById('malvi-avatar-fixture')?.textContent,
        actions:window.__fixtureActions,sdkStarts:window.__sdkStarts
      })`));
      throw error;
    }
  };
  await page.wait('document.getElementById("root")?.textContent?.includes("Nanivio")');
  await page.evaluate(`import('/${output}?fixture=${Date.now()}')`);
  const click = text => page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)})).click()`);
  const mount = async configured => {
    await page.evaluate(`window.__mountMalviFixture(${configured})`);
    await page.wait(`document.querySelector('[aria-label="Malvi LiveAvatar"]') && window.__fixtureActions.some(a=>a.path==='/status')`);
    await page.wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Start live avatar') && b.disabled===${!configured})`);
  };
  await mount(false);
  await page.wait(`Array.from(document.querySelectorAll('#malvi-avatar-fixture img')).some(i=>i.complete&&i.naturalWidth>0)`);
  assert.equal(await page.evaluate(`window.__fixtureActions.some(a=>a.path==='/session')`), false);
  assert.ok((await page.evaluate(`document.getElementById('malvi-avatar-fixture').textContent`)).includes('AVATAR_ID'));
  for (const [name, width, height, mobile] of [['mobile',390,844,true],['desktop',1366,900,false]]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    assert.equal(await page.evaluate(`document.getElementById('malvi-avatar-fixture').scrollWidth>innerWidth`), false);
    const shot = await page.command('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    await fs.writeFile(`generated-artifacts/malvi-${name}.jpg`, Buffer.from(shot.data, 'base64'));
  }
  console.log('PASS: supplied identity loads on phone/desktop; missing setup is explicit; no idle session starts');
  await mount(true);
  await page.evaluate(`window.SpeechRecognition=undefined`);
  await click('Enable local');
  await page.wait(`document.getElementById('malvi-avatar-fixture').textContent.includes('no cloud listening')`);
  assert.equal(await page.evaluate(`window.__fixtureActions.some(a=>a.path==='/session')`), false);
  console.log('PASS: unsupported on-device wake word fails explicitly without cloud recognition or handshake');
  await mount(true);
  await page.evaluate(`class LocalRecognition{
    static async available(){return 'available'}
    start(){window.__recognition=this}
    abort(){}
  };LocalRecognition.prototype.processLocally=false;window.SpeechRecognition=LocalRecognition`);
  await click('Enable local');
  await page.wait(`document.getElementById('malvi-avatar-fixture').textContent.includes('Listening locally')`);
  assert.equal(await page.evaluate(`window.__fixtureActions.some(a=>a.path==='/session')`), false);
  await page.evaluate(`const result=[{transcript:'Nanivio'}];result.isFinal=true;window.__recognition.onresult({resultIndex:0,results:[result]})`);
  await page.wait(`!!document.querySelector('[data-fixture-stream="true"]')`);
  assert.equal(await page.evaluate(`window.__fixtureActions.find(a=>a.path==='/session').body.activation`), 'wake-word');
  assert.equal(await page.evaluate('window.__sdkMicOpens'), 0);
  await page.wait(`document.querySelector('[role="dialog"]')?.textContent.includes('Backend welcome voice')`);
  await page.evaluate('window.__clockOffset=61000');
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  await page.wait(`window.__fixtureActions.some(a=>a.path.endsWith('/end'))`);
  assert.equal(await page.evaluate('window.__sdkStops'), 1);
  assert.equal(await page.evaluate(`window.__fixtureActions.filter(a=>a.path==='/session').length`), 1);
  console.log('PASS: local wake triggers one handshake; SDK mic stays disabled; 60s idle closes without reconnect');
  await mount(true);
  await page.evaluate('window.__holdHandshake=true');
  await click('Start live avatar');
  await page.wait(`!!document.querySelector('[role="dialog"]')`);
  await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label]')?.click()`);
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  await page.evaluate('window.__releaseHandshake()');
  await page.wait(`window.__fixtureActions.some(a=>a.path.endsWith('/end'))`);
  assert.equal(await page.evaluate('window.__sdkStarts'), 0);
  console.log('PASS: closing during handshake releases the late session without starting SDK video');
  await mount(true);
  await page.evaluate(`window.__mode='FULL'`);
  await click('Start live avatar');
  await page.wait(`document.querySelector('[role="dialog"]')?.textContent.includes('non-LITE')`);
  assert.equal(await page.evaluate('window.__sdkStarts'), 0);
  await page.wait(`window.__fixtureActions.some(a=>a.path.endsWith('/end'))`);
  console.log('PASS: non-LITE provider sessions are rejected and cleaned up before SDK start');
} finally {
  await browser.close();
  await fs.rm(output, { force: true });
}
