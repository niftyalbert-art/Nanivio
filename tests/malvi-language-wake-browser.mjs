import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const contextFixture = `
  import React from 'react';
  export const Context = React.createContext(null);
  export const useNanivio = () => React.useContext(Context);
`;
const realtimeFixture = `
  const listeners = new Map();
  window.emitBrain = (type, payload) => { for(const fn of listeners.get(type)||[]) fn(payload); };
  export const realtimeClient = {
    on(type, fn) {
      if(!listeners.has(type)) listeners.set(type,new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    send(type,payload) { window.checks.messages.push({type,payload}); }
  };
`;
const sdkFixture = `
  export const SessionMode = {LITE:'LITE'};
  export const SessionEvent = {SESSION_STREAM_READY:'stream', SESSION_DISCONNECTED:'disconnected'};
  export class LiveAvatarSession {
    mode='LITE'; events={};
    voiceChat={
      start:async()=>{window.checks.providerMicrophones++;},
      stop:async()=>{}
    };
    constructor() { window.checks.sdkCreations++; }
    on(type,fn) { this.events[type]=fn; }
    async start() { await this.voiceChat.start(); this.events.stream?.(); }
    async stop() { window.checks.sdkStops++; }
    attach() {}
    interrupt() { window.checks.interrupts++; }
    repeatAudio(audio) { window.checks.playedAudio.push(audio); }
  }
`;
const output = await build({
  stdin: {
    loader: 'tsx', resolveDir: process.cwd(),
    contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Context} from 'fixture-context';
      import {MalviLiveAssistantProvider,MalviLiveControls} from './src/components/malvi/MalviLiveAssistant';
      window.checks={requests:[],messages:[],sdkCreations:0,sdkStops:0,providerMicrophones:0,interrupts:0,playedAudio:[],localStarts:0,localStops:0,installs:0};
      window.availability='available';
      class TestAudioContext {
        state='running';currentTime=0;destination={};
        async resume(){this.state='running';}
        async close(){this.state='closed';window.checks.audioClosed=(window.checks.audioClosed||0)+1;}
        createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
        createBufferSource(){return {connect(){},disconnect(){},start(){window.checks.voicePlayed=(window.checks.voicePlayed||0)+1;},stop(){window.checks.voiceInterrupted=(window.checks.voiceInterrupted||0)+1;}};}
      }
      window.AudioContext=TestAudioContext;
      class Recognition {
        static available(options) {
          if(!options.processLocally) throw Error('Cloud recognition is forbidden');
          return window.availability==='pending'
            ? new Promise(resolve=>{window.resolveAvailability=resolve})
            : Promise.resolve(window.availability);
        }
        static async install(options) {
          if(!options.processLocally) throw Error('Cloud installation is forbidden');
          window.checks.installs++; window.availability='available'; return true;
        }
        start(){
          window.checks.localStarts++;window.recognizer=this;
          if(window.recognitionFailure)this.onerror({error:window.recognitionFailure});
          else queueMicrotask(()=>this.onstart?.());
        }
        abort(){window.checks.localStops++;}
      }
      Object.defineProperty(Recognition.prototype,'processLocally',{value:false,writable:true});
      window.SpeechRecognition=Recognition;
      window.fetch=async(input,init={})=>{
        const url=String(input),body=init.body?JSON.parse(init.body):null;
        window.checks.requests.push({url,body});
        const data=url.endsWith('/status')
          ? {success:true,configured:window.setupReady!==false,enabled:true,missing:window.setupReady===false?['AVATAR_ID']:[],brainProvider:'gemini',welcomeVoiceConfigured:true,brainConnected:false,canRunSetupTests:true,voiceTestAvailable:true}
          : url.endsWith('/diagnostics')
          ? {success:true,redis:'connected',brain:{configured:true},providerSessionStarted:false}
          : url.endsWith('/session') || url.endsWith('/voice-session')
          ? {success:true,id:'11111111-1111-4111-8111-111111111111',sessionToken:'isolated-fixture',language:body.language,idleDeadline:Date.now()+60000}
          : {success:true};
        return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      };
      function Fixture(){
        const [appLanguage,setAppLanguage]=useState('en');
        const [statusVersion,setStatusVersion]=useState(0);
        window.refreshFixture=()=>setStatusVersion(value=>value+1);
        window.setAppLanguage=setAppLanguage;
        return <Context.Provider value={{appLanguage,setAppLanguage,currentUser:{id:'isolated-user-'+statusVersion,appLanguage,myLanguage:'en'}}}>
          <div className="nanivio-app nv-theme-dark" style={{minHeight:'100vh',padding:12}}>
            <MalviLiveAssistantProvider><MalviLiveControls/></MalviLiveAssistantProvider>
          </div>
        </Context.Provider>;
      }
      createRoot(document.getElementById('root')).render(<Fixture/>);
    `,
  },
  bundle: true, format: 'iife', platform: 'browser', write: false, loader: { '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'isolated-malvi-context-and-providers',
    setup(build) {
      build.onResolve({ filter: /NanivioContext$|^fixture-context$/ }, () => ({ path: 'context', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /realtimeClient$/ }, () => ({ path: 'realtime', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /authClient$/ }, () => ({ path: 'auth', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /^@heygen\/liveavatar-web-sdk$/ }, () => ({ path: 'sdk', namespace: 'malvi-fixture' }));
      build.onResolve({ filter: /MalviLiveOverlay$/ }, () => ({ path: 'overlay', namespace: 'malvi-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'malvi-fixture' }, args => ({
        loader: 'js', resolveDir: process.cwd(),
        contents: ({
          context: contextFixture, realtime: realtimeFixture, sdk: sdkFixture,
          auth: `export const authClient={getToken:()=>null};`,
          overlay: `import React from 'react';import {MalviLiveOverlay as Overlay} from './src/components/malvi/MalviLiveOverlay.tsx';export function MalviLiveOverlay(props){window.overlay=props;return React.createElement(React.Fragment,null,React.createElement('span',{'data-live-overlay':true,hidden:true}),React.createElement(Overlay,props));}`,
        })[args.path],
      }));
    },
  }],
});
const cssFile = fs.readdirSync('dist/assets').find(name => name.startsWith('index-') && name.endsWith('.css'));
assert.ok(cssFile, 'Run npm run build before checking the real compiled mobile styles');
const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8');
const browser = await launchBrowser();
try {
  const page = await browser.page('about:blank');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const tree = await page.command('Page.getFrameTree');
  await page.command('Page.setDocumentContent', {
    frameId: tree.frameTree.frame.id,
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${output.outputFiles[0].text}</script></body></html>`,
  });
  await page.wait(`Boolean(document.querySelector('[aria-label="Malvi conversation language"]') && ![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start live avatar'))?.disabled)`);
  const click = text => page.evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!button||button.disabled)throw Error('Missing enabled button');button.click();return true;})()`);
  const select = value => page.evaluate(`(()=>{const element=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  const sessionCount = () => page.evaluate(`window.checks.requests.filter(r=>r.url.endsWith('/session')).length`);
  assert.equal(await sessionCount(), 0, 'Idle controls must not start a billable session');
  assert.equal(await page.evaluate('window.checks.localStarts'), 0, 'Idle controls must not start listening');
  const buttonStyle = await page.evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start live avatar'));const style=getComputedStyle(button);return {background:style.backgroundColor,color:style.color};})()`);
  assert.equal(buttonStyle.background, 'rgb(226, 187, 98)');
  assert.equal(buttonStyle.color, 'rgb(18, 20, 23)', 'The live activation button must stay readable in the shared theme');
  assert.equal(await page.evaluate('document.querySelectorAll("select option").length'), 34);
  await select('fr');
  await page.wait(`document.querySelector('select').value==='fr'`);

  for (const [width, height] of [[320,640], [390,844], [768,1024]]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    const sizing = await page.evaluate(`(()=>{const e=document.querySelector('select'),s=e.getBoundingClientRect();return {viewport:innerWidth,document:document.documentElement.scrollWidth,left:s.left,right:s.right};})()`);
    assert.ok(sizing.document <= sizing.viewport + 1, `Malvi controls overflow at ${width}px`);
    assert.ok(sizing.left >= 0 && sizing.right <= sizing.viewport + 1);
  }
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // These are browser fixtures, not evidence of a real user's microphone or browser support.
  await page.evaluate(`window.originalRecognition=window.SpeechRecognition;window.SpeechRecognition=undefined;true`);
  await click('Enable local wake word');
  await page.wait(`document.body.textContent.includes('This browser cannot verify on-device')`);
  assert.equal(await sessionCount(), 0);
  await page.evaluate(`window.SpeechRecognition=window.originalRecognition;window.availability='unavailable';true`);
  await click('Enable local wake word');
  await page.wait(`document.body.textContent.includes('cannot download the required English')`);
  assert.equal(await page.evaluate(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Install local speech pack')))`), false);
  await page.evaluate(`window.availability='available';window.recognitionFailure='not-allowed';true`);
  await click('Enable local wake word');
  await page.wait(`document.body.textContent.includes('access was blocked')`);
  assert.equal(await page.evaluate(`document.querySelector('button[aria-pressed="true"]')!==null`), false);
  assert.equal(await sessionCount(), 0);
  await page.evaluate(`window.recognitionFailure=null;window.checks.localStarts=0;window.setupReady=false;window.refreshFixture();true`);
  await page.wait(`document.body.textContent.includes('Live setup required: AVATAR_ID')`);
  await click('Enable local wake word');
  await page.wait(`document.body.textContent.includes('Listening locally for')`);
  await page.evaluate(`(()=>{const r=[{transcript:'Hey Malvi'}];r.isFinal=true;window.recognizer.onresult({resultIndex:0,results:[r]});return true;})()`);
  await page.wait(`document.body.textContent.includes('live assistant is not ready')`);
  assert.equal(await sessionCount(), 0, 'Incomplete live setup must not open a paid session from a local wake event');
  await page.evaluate(`window.checks.localStarts=0;window.setupReady=true;window.refreshFixture();true`);
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start live avatar')&&!b.disabled))`);

  await page.evaluate(`window.availability='pending';true`);
  await click('Enable local wake word');
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Cancel wake setup')))`);
  await click('Cancel wake setup');
  await page.evaluate(`window.resolveAvailability('available');true`);
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enable local wake word')))`);
  assert.equal(await page.evaluate('window.checks.localStarts'), 0);
  assert.equal(await sessionCount(), 0);

  await page.evaluate(`window.availability='downloadable';true`);
  await click('Enable local wake word');
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Install local speech pack')))`);
  assert.equal(await page.evaluate('window.checks.installs'), 0);
  await click('Install local speech pack');
  await page.wait('window.checks.installs===1');
  assert.equal(await page.evaluate('window.checks.localStarts'), 0);
  await click('Enable local wake word');
  await page.wait('window.checks.localStarts===1');
  await click('Stop local listening');
  await page.evaluate(`(()=>{const r=[{transcript:'Hey Malvi'}];r.isFinal=true;window.recognizer.onresult({resultIndex:0,results:[r]});return true;})()`);
  assert.equal(await sessionCount(), 0, 'Late wake events after Stop must be ignored');

  await click('Enable local wake word');
  await page.wait('window.checks.localStarts===2');
  await page.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));true`);
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enable local wake word')))`);
  assert.equal(await sessionCount(), 0);
  await page.evaluate(`delete document.hidden;true`);
  if (process.env.NANIVIO_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.NANIVIO_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, 'malvi-language-wake-mobile.png'));
  }

  await click('Enable local wake word');
  await page.wait('window.checks.localStarts===3');
  await page.evaluate(`(()=>{const r=[{transcript:'Hey Malvi'}];r.isFinal=true;window.recognizer.onresult({resultIndex:0,results:[r]});window.recognizer.onresult({resultIndex:0,results:[r]});return true;})()`);
  await page.wait(`window.checks.messages.some(m=>m.type==='malvi:brain_start')`);
  const before = await page.evaluate(`JSON.parse(JSON.stringify(window.checks))`);
  assert.equal(await sessionCount(), 1);
  assert.equal(before.sdkCreations, 1);
  assert.equal(before.providerMicrophones, 0, 'LITE SDK must not capture the user microphone');
  assert.equal(before.requests.find(r => r.url.endsWith('/session')).body.activation, 'wake-word');
  assert.equal(before.requests.find(r => r.url.endsWith('/session')).body.language, 'fr');
  assert.equal(before.messages.find(m => m.type === 'malvi:brain_start').payload.language, 'fr');
  assert.equal(before.requests.filter(r => r.url.endsWith('/welcome')).length, 0, 'Never inject an English welcome into a selected-language conversation');
  await page.evaluate(`window.emitBrain('malvi:brain_ready',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'fr'});true`);
  await select('gaa');
  await page.wait(`window.checks.messages.some(m=>m.type==='malvi:brain_language'&&m.payload.language==='gaa')`);
  await page.evaluate(`window.emitBrain('malvi:brain_language',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'gaa'});true`);
  await page.wait(`Boolean(document.body.textContent.includes('language preference is now Ga'))`);
  assert.equal(await sessionCount(), 1, 'A language change must not open another avatar session');
  assert.equal(await page.evaluate('window.checks.providerMicrophones'), 0);
  assert.equal(await page.evaluate(`document.querySelector('select').value`), 'gaa');
  assert.ok(await page.evaluate(`document.body.textContent.includes('not explicitly listed')`));
  await page.evaluate(`window.emitBrain('malvi:brain_language_error',{sessionId:'11111111-1111-4111-8111-111111111111',message:'Selected language could not be applied.'});true`);
  await page.wait(`window.checks.sdkStops===1`);
  assert.equal(await sessionCount(), 1, 'Failed updates must not auto-start another paid session');
  await page.evaluate(`window.overlay.onClose();true`);
  await page.wait(`!document.querySelector('[data-live-overlay]')`);
  await click('Check Redis connection');
  await page.wait(`document.body.textContent.includes('Redis: connected')`);
  assert.equal(await sessionCount(), 1, 'Diagnostics must not initialize a session');
  await click('Test voice only');
  await page.wait(`window.checks.requests.some(r=>r.url.endsWith('/voice-session'))`);
  assert.equal(await page.evaluate('window.checks.sdkCreations'), 1, 'Voice-only test must never create an avatar SDK');
  assert.equal(await page.evaluate('window.overlay.voiceOnly'), true);
  await page.evaluate(`window.emitBrain('malvi:brain_ready',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'gaa'});true`);
  await page.wait(`window.overlay.brainReady===true && window.overlay.phase==='connected'`);
  assert.equal(await page.evaluate('Boolean(document.querySelector("video"))'), false, 'Voice-only UI must not show a fake live video');
  assert.ok(await page.evaluate(`document.body.textContent.includes('Voice connected · no avatar')`));
  if (process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, 'malvi-voice-only-mobile.png'));
  assert.equal(await page.evaluate('window.overlay.microphoneOn'), false, 'Voice-only connection must not start microphone automatically');
  await page.evaluate(`window.emitBrain('malvi:brain_audio',{sessionId:'11111111-1111-4111-8111-111111111111',language:'gaa',pcm24k:'AAAAAA==',sampleRate:24000,format:'pcm_s16le',channels:1});true`);
  await page.wait('window.checks.voicePlayed===1');
  await page.evaluate(`window.overlay.onInterrupt();true`);
  await page.wait(`window.checks.messages.some(m=>m.type==='malvi:brain_interrupt')`);
  assert.ok(await page.evaluate('window.checks.voiceInterrupted>=1'));
  await page.evaluate(`window.overlay.onClose();true`);
  await page.wait('window.checks.audioClosed>=1');
  assert.equal(await page.evaluate('window.checks.sdkCreations'), 1);
  console.log(JSON.stringify({ mobileWidths: [320,390,768], appLanguageSelector: true, noIdleProviderOrMicrophone: true, cancellableWakeSetup: true, explicitLocalPackInstall: true, stoppedAndHiddenWakeCannotActivate: true, onceOnlyHeyMalviActivation: true, selectedLanguageSentToBackend: true, noEnglishWelcome: true, activeLanguageUpdateWithoutNewAvatar: true, unverifiedLanguageWarning: true, failedUpdatesCloseRatherThanFallBack: true }));
} finally {
  await browser.close();
}
