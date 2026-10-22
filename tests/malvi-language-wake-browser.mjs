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
    send(type,payload) {
      if(type==='nanivio:mic_audio'&&window.failMicrophoneSend)return false;
      window.checks.messages.push({type,payload});
      if(type==='nanivio:mic_start')queueMicrotask(()=>window.emitBrain('nanivio:mic_status',{sessionId:payload.sessionId,streamId:payload.streamId,version:1,state:'ready',provider:'gemini',language:'fr'}));
      if(type==='nanivio:mic_audio')queueMicrotask(()=>window.emitBrain('nanivio:mic_status',{sessionId:payload.sessionId,streamId:payload.streamId,version:1,state:'receiving',lastSequence:payload.sequence,receivedFrames:payload.sequence}));
      return true;
    }
  };
`;
const sdkFixture = `
  export const SessionMode = {LITE:'LITE'};
  export const SessionEvent = {SESSION_STREAM_READY:'stream', SESSION_DISCONNECTED:'disconnected'};
  export const AgentEventsEnum = {AVATAR_SPEAK_STARTED:'speak-start',AVATAR_SPEAK_ENDED:'speak-end'};
  export class LiveAvatarSession {
    mode='LITE'; events={};
    voiceChat={
      start:async()=>{window.checks.providerMicrophones++;},
      stop:async()=>{}
    };
    constructor() { window.checks.sdkCreations++; window.emitAvatar=(type)=>this.events[type]?.(); }
    on(type,fn) { this.events[type]=fn; }
    async start() {
      await this.voiceChat.start();
      if(window.deferAvatarStart) await new Promise(resolve=>{window.releaseAvatarStart=resolve;});
      this.events.stream?.();
    }
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
      // This isolated about:blank fixture models the production HTTPS page.
      // Insecure-origin rejection is covered separately in the unit matrix.
      Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
      class TestAudioContext {
        state='running';currentTime=0;destination={};sampleRate=16000;
        constructor(){window.fixtureAudioContext=this;}
        get audioWorklet(){return {addModule:async()=>{}};}
        createMediaStreamSource(){return {connect(){},disconnect(){}};}
        createAnalyser(){window.outputAudioContext=this;return {fftSize:1024,connect(){},disconnect(){},getFloatTimeDomainData(samples){samples.fill(window.outputLevel||0);}};}
        createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
        async resume(){this.state='running';}
        async close(){this.state='closed';window.checks.audioClosed=(window.checks.audioClosed||0)+1;}
        createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
        createBufferSource(){return {connect(){},disconnect(){},start(){window.checks.voicePlayed=(window.checks.voicePlayed||0)+1;},stop(){window.checks.voiceInterrupted=(window.checks.voiceInterrupted||0)+1;}};}
      }
      window.AudioContext=TestAudioContext;
      HTMLMediaElement.prototype.captureStream=function(){
        const track={stop(){}};
        return {getAudioTracks:()=>[track],getTracks:()=>[track]};
      };
      window.AudioWorkletNode=class {
        port={onmessage:null};
        constructor(){window.inputProcessor=this;}
        connect(){} disconnect(){}
      };
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
        getUserMedia:async()=> {
          window.inputTrack={stop(){window.checks.micStopped=(window.checks.micStopped||0)+1;},onended:null,onmute:null};
          return {getTracks:()=>[window.inputTrack],getAudioTracks:()=>[window.inputTrack]};
        }
      }});
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
      window.webkitSpeechRecognition=class LegacyCloudRecognition {
        start(){window.checks.cloudStarts=(window.checks.cloudStarts||0)+1;throw Error('Cloud wake recognition is forbidden');}
      };
      window.fetch=async(input,init={})=>{
        const url=String(input),body=init.body?JSON.parse(init.body):null;
        window.checks.requests.push({url,body});
        const data=url.endsWith('/status')
           ? {success:true,configured:window.setupReady!==false,enabled:true,missing:window.setupReady===false?['AVATAR_ID']:[],brainProvider:'gemini',welcomeVoiceConfigured:true,brainConnected:false,canRunSetupTests:true,voiceTestAvailable:true,speech:window.speechSupport?{provider:'elevenlabs',model:'eleven_multilingual_v2',configured:true,supportedLanguages:window.speechSupport,liveVerified:false}:undefined}
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
          overlay: `import React from 'react';import {MalviLiveOverlay as Overlay} from './src/components/malvi/MalviLiveOverlay.tsx';export function MalviLiveOverlay(props){const [feedback,setFeedback]=React.useState({});window.setOverlayFeedback=setFeedback;window.overlay=props;return React.createElement(React.Fragment,null,React.createElement('span',{'data-live-overlay':true,hidden:true}),React.createElement(Overlay,{...props,...feedback}));}`,
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
  await page.wait(`document.body.innerText.includes('This browser cannot verify on-device')`);
  const unsupportedFeedback=await page.evaluate(`(()=>{
    const button=document.querySelector('button[aria-label="Local wake-word listening"]');
    const feedback=button.parentElement.querySelector('[role="status"]');
    return {pressed:button.getAttribute('aria-pressed'),nearby:!!feedback,text:feedback?.textContent,
      gap:feedback?feedback.getBoundingClientRect().top-button.getBoundingClientRect().bottom:999,
      cloudStarts:window.checks.cloudStarts||0};
  })()`);
  assert.equal(unsupportedFeedback.pressed,'false');
  assert.equal(unsupportedFeedback.nearby,true,'Unsupported feedback must be beside the control, not below unrelated setup text');
  assert.ok(unsupportedFeedback.gap<60);
  assert.match(unsupportedFeedback.text,/Start live avatar/);
  assert.equal(unsupportedFeedback.cloudStarts,0);
  if (process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR,'malvi-wake-unsupported.png'));
  assert.equal(await sessionCount(), 0);
  await page.evaluate(`window.SpeechRecognition=window.originalRecognition;window.availability='unavailable';true`);
  await click('Enable local wake word');
  await page.wait(`document.body.innerText.includes('cannot download the required English')`);
  assert.equal(await page.evaluate(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Install local speech pack')))`), false);
  await page.evaluate(`window.availability='available';window.recognitionFailure='not-allowed';true`);
  await click('Enable local wake word');
  await page.wait(`document.body.innerText.includes('access was blocked')`);
  assert.equal(await page.evaluate(`document.querySelector('button[aria-pressed="true"]')!==null`), false);
  assert.equal(await sessionCount(), 0);
  await page.evaluate(`window.recognitionFailure=null;window.checks.localStarts=0;window.setupReady=false;window.refreshFixture();true`);
  await page.wait(`document.body.innerText.includes('Live setup required: AVATAR_ID')`);
  await click('Enable local wake word');
  await page.wait(`document.body.innerText.includes('Listening locally for')`);
  const firstWake=await page.evaluate(`(()=>{try{const r=[{transcript:'Hey Malvi'}];r.isFinal=true;window.recognizer.onresult({resultIndex:0,results:[r]});return 'ok';}catch(error){return String(error);}})()`);
  assert.equal(firstWake,'ok','Local wake fixture must process the recognized phrase');
  await page.wait(`document.body.innerText.includes('live assistant is not ready')`);
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
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Enabled'&&b.getAttribute('aria-pressed')==='true'))`);
  assert.equal(await page.evaluate(`document.body.innerText.includes('Enabled — Listening locally')`), true);
  if (process.env.NANIVIO_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.NANIVIO_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, 'malvi-wake-enabled-mobile.png'));
  }
  await click('Enabled');
  await page.wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enable local wake word')&&b.getAttribute('aria-pressed')==='false'))`);
  assert.equal(await page.evaluate(`document.body.innerText.includes('Enabled — Listening locally')`), false);
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

  await page.evaluate('window.deferAvatarStart=true;true');
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
  await page.wait('typeof window.releaseAvatarStart==="function"');
  assert.equal(await page.evaluate('window.checks.playedAudio.length'),0);
  assert.equal(await page.evaluate('window.overlay.phase'),'connecting','Brain startup must not wait for the renderer');
  await page.evaluate(`(()=>{
    window.emitBrain('malvi:brain_ready',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'fr'});
    const chars=Array.from('Bonjour. '.repeat(40));
    window.emitBrain('malvi:brain_audio',{sessionId:'11111111-1111-4111-8111-111111111111',language:'fr',pcm24k:'AAAAAA==',sampleRate:24000,format:'pcm_s16le',channels:1,durationMs:5000,
      alignment:{characters:chars,character_start_times_seconds:chars.map((_,i)=>i/100),character_end_times_seconds:chars.map((_,i)=>(i+1)/100)}});
    return true;
  })()`);
  assert.equal(await page.evaluate('window.checks.playedAudio.length'),0,'Early voice must wait for the renderer, without being lost or sent to an unready SDK');
  assert.equal(await page.evaluate('window.overlay.caption'),'','Early speech must not expose subtitles');
  await page.evaluate('window.deferAvatarStart=false;window.releaseAvatarStart();true');
  await page.wait('window.overlay.phase==="connected"');
  await page.wait('window.checks.playedAudio.length===1');
  await page.evaluate(`window.emitBrain('malvi:brain_ready',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'fr'});true`);
  await page.evaluate(`window.emitBrain('malvi:brain_caption',{sessionId:'11111111-1111-4111-8111-111111111111',language:'fr',role:'assistant',text:'Bonjour. '.repeat(100)});true`);
  assert.equal(await page.evaluate('window.overlay.caption'), '', 'Brain tokens must never become pre-speech subtitles');
  await page.evaluate(`(()=>{
    const video=document.querySelector('video'); window.fixtureVideoTime=0;window.fixtureVideoPaused=false;
    Object.defineProperty(video,'currentTime',{configurable:true,get:()=>window.fixtureVideoTime});
    Object.defineProperty(video,'paused',{configurable:true,get:()=>window.fixtureVideoPaused});
    video.muted=false;video.volume=1;
     video.dispatchEvent(new Event('playing'));
    return true;
  })()`);
  assert.equal(await page.evaluate('window.overlay.caption'), '', 'Queued audio must wait for avatar playback');
   await page.evaluate(`window.emitAvatar('speak-start');window.fixtureVideoTime=2;true`);
   await new Promise(resolve=>setTimeout(resolve,100));
   assert.equal(await page.evaluate('window.overlay.caption'), '', 'An early SDK event and advancing video clock cannot expose captions before output audio');
   await page.evaluate(`window.outputLevel=0.1;true`);
   await new Promise(resolve=>setTimeout(resolve,60));
   await page.evaluate(`window.outputAudioContext.currentTime=2;true`);
  await page.wait(`Boolean(document.querySelector('[aria-label="Live subtitles"]'))`);
  for (const width of [320,390,768,1280]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    const box = await page.evaluate(`(()=>{
      const el=document.querySelector('[aria-label="Live subtitles"]');
      const rect=el.getBoundingClientRect();
      const panel=Array.from(document.querySelectorAll('details')).find(d=>d.querySelector('summary')?.textContent==='Audio & sources');
      return {top:rect.top,bottom:rect.bottom,height:rect.height,screen:innerHeight,scroll:el.scrollHeight,client:el.clientHeight,detailsOpen:panel?.open,disclosure:document.body.innerText.includes('AI disclosure ·')};
    })()`);
    assert.ok(box.top > box.screen / 2, `Subtitles should be at the bottom at ${width}px`);
    assert.ok(box.bottom <= box.screen, `Subtitles must remain in the viewport at ${width}px`);
    assert.ok(box.height <= 80, `Long subtitles must not cover the avatar at ${width}px`);
    assert.ok(await page.evaluate('window.overlay.caption.length<=220'), 'Only a compact spoken-text window is displayed');
    assert.equal(box.detailsOpen, false);
    assert.equal(box.disclosure, false, 'The repeated full disclosure must be removed');
    if (process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, `malvi-subtitles-${width}.png`));
  }
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.evaluate(`window.emitAvatar('speak-end');true`);
   assert.notEqual(await page.evaluate('window.overlay.caption'), '', 'Provider completion must not erase buffered spoken captions');
   await page.evaluate(`window.outputLevel=0;window.outputAudioContext.currentTime=5.2;true`);
  await page.wait('window.overlay.caption===""');
  await click('Start talking');
  await page.wait('window.overlay.microphoneOn===true').catch(async error=>{
    console.error(await page.evaluate(`JSON.stringify({microphoneError:window.overlay.microphoneError,latestEvents:window.checks.messages.slice(-3).map(e=>e.type)})`));
    throw error;
  });
  assert.equal(await page.evaluate('window.overlay.inputState'), 'connecting', 'Capture alone is not evidence of gateway receipt');
  await page.evaluate(`(()=>{
    const samples=new Int16Array(3200).fill(8000);
    const bytes=new Uint8Array(samples.buffer);
    window.fixtureHeardAt=performance.now();
    window.inputProcessor.port.onmessage({data:bytes.buffer});
    return true;
  })()`);
  await page.wait('window.overlay.inputState==="hearing"');
  assert.ok(await page.evaluate('window.overlay.inputLevel>0'));
  const sentMicrophone = await page.evaluate(`window.checks.messages.filter(m=>m.type==='nanivio:mic_audio').at(-1)`);
  assert.equal(Buffer.from(sentMicrophone.payload.audio,'base64').length,6400);
  assert.equal(Buffer.from(sentMicrophone.payload.audio,'base64').readInt16LE(0),8000,'Binary worklet speech must reach the authenticated transport unchanged');
  await page.evaluate(`window.emitBrain('malvi:brain_caption',{sessionId:'11111111-1111-4111-8111-111111111111',role:'user',text:'Bonjour Malvi'});true`);
  await page.wait('window.overlay.userTranscript==="Bonjour Malvi"');
  assert.equal(await page.evaluate('window.overlay.caption'), '', 'User speech is separate from Malvi subtitles');
  if (process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, 'malvi-listening.png'));
  await page.wait('performance.now()-window.fixtureHeardAt>750');
  await page.evaluate(`window.inputProcessor.port.onmessage({data:new ArrayBuffer(6400)});true`);
  await page.wait('window.overlay.inputState==="processing"');
  await page.evaluate(`window.inputTrack.onmute();true`);
  await page.wait('window.overlay.microphoneOn===false');
  assert.equal(await page.evaluate('window.overlay.inputLevel'), 0);
  await click('Start talking');
  await page.wait('window.overlay.microphoneOn===true');
  await page.evaluate(`window.fixtureAudioContext.state='suspended';window.fixtureAudioContext.onstatechange();true`);
  await page.wait('window.overlay.microphoneOn===false');
  assert.equal(await page.evaluate('window.overlay.inputState'), 'off', 'Suspended browser audio must not falsely appear to be listening');
  await click('Start talking');
  await page.wait('window.overlay.microphoneOn===true');
  await page.evaluate(`window.staleMicrophoneHandler=window.inputProcessor.port.onmessage;window.inputProcessor.onprocessorerror();true`);
  await page.wait('window.overlay.microphoneOn===false');
  assert.match(await page.evaluate('window.overlay.microphoneError'),/recorder stopped/);
  const stoppedAudioCount=await page.evaluate(`window.checks.messages.filter(m=>m.type==='nanivio:mic_audio').length`);
  await page.evaluate(`window.staleMicrophoneHandler({data:new ArrayBuffer(6400)});true`);
  assert.equal(await page.evaluate(`window.checks.messages.filter(m=>m.type==='nanivio:mic_audio').length`),stoppedAudioCount,'A queued message cannot send microphone audio after capture stops');
  await click('Start talking');
  await page.wait('window.overlay.microphoneOn===true');
  await page.evaluate(`window.failMicrophoneSend=true;window.inputProcessor.port.onmessage({data:new ArrayBuffer(6400)});window.failMicrophoneSend=false;true`);
  await page.wait('window.overlay.microphoneOn===false');
  assert.match(await page.evaluate('window.overlay.microphoneError'),/connection stopped receiving/);
  await click('Start talking');
  await page.wait('window.overlay.microphoneOn===true');
  await page.wait('window.overlay.microphoneOn===false',7000);
  assert.match(await page.evaluate('window.overlay.microphoneError'),/No microphone audio is arriving/,'A stalled recorder cannot stay falsely active');
  await page.evaluate(`(()=>{
    const el=document.querySelector('video');
    window.fixtureVideoPaused=false;
    Object.defineProperty(el,'paused',{configurable:true,get:()=>window.fixtureVideoPaused});
    el.play=async()=>{window.fixtureVideoPaused=false;};
    el.muted=true;el.volume=0;el.dispatchEvent(new Event('volumechange'));
    return true;
  })()`);
  await page.wait('window.overlay.audioBlocked===true');
  await click('Enable sound');
  await page.wait('window.overlay.audioBlocked===false');
  assert.equal(await page.evaluate('document.querySelector("video").muted'), false);
  assert.equal(await page.evaluate('document.querySelector("video").volume'), 1);
  await page.evaluate(`document.querySelector('video').muted=true;document.querySelector('video').dispatchEvent(new Event('volumechange'));true`);
  await page.wait('window.overlay.audioBlocked===true');
  await click('Enable sound');
  await page.wait('window.overlay.audioBlocked===false');
  const feedbackMessage = 'The speech provider could not complete the request. '.repeat(40);
  for (const [width, height] of [[320,640],[390,844],[1280,900]]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    for (const [phase, microphoneError] of [['connecting',''], ['error',''], ['connected',feedbackMessage]]) {
      const feedback = phase === 'connecting' ? 'Joining your conversation' : feedbackMessage;
      await page.evaluate(`window.setOverlayFeedback(${JSON.stringify({ phase, caption: '', audioBlocked: false, microphoneError, error: feedbackMessage })});true`);
      await page.wait(`Boolean(Array.from(document.querySelectorAll('p,span')).find(e=>e.textContent===${JSON.stringify(feedback)}))`);
      const position = await page.evaluate(`(()=>{
        const message=Array.from(document.querySelectorAll('p,span')).find(e=>e.textContent===${JSON.stringify(feedback)});
        const box=message.closest('[aria-label="Session status and feedback"]');
        const rect=box.getBoundingClientRect();
        return {inFooter:Boolean(message.closest('footer')),top:rect.top,bottom:rect.bottom,height:rect.height,screen:innerHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,scroll:box.scrollHeight,client:box.clientHeight,closeVisible:document.querySelector('[aria-label="End session and close"]').getBoundingClientRect().bottom<=innerHeight};
      })()`);
      assert.equal(position.inFooter, true, `${phase} feedback must not cover the central portrait`);
      assert.ok(position.top > position.screen / 2, `${phase} feedback must remain at the bottom at ${width}px`);
      assert.ok(position.bottom <= position.screen, `${phase} feedback must fit the viewport`);
      assert.ok(position.height <= 130, `${phase} feedback must have a bounded height`);
      assert.ok(position.width <= position.viewport + 1, 'Feedback must not create horizontal overflow');
      assert.equal(position.closeVisible, true, 'End session must remain reachable');
      if (phase !== 'connecting') assert.ok(position.scroll > position.client, 'Full long feedback must remain accessible by scrolling');
      if (phase === 'error' && process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, `malvi-feedback-${width}.png`));
    }
  }
  await page.evaluate('window.setOverlayFeedback({});true');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await select('gaa');
  await page.wait(`window.checks.messages.some(m=>m.type==='malvi:brain_language'&&m.payload.language==='gaa')`);
  await page.evaluate(`window.emitBrain('malvi:brain_language',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'gaa'});true`);
  await page.wait('window.overlay.brainReady===true');
  assert.equal(await page.evaluate('window.overlay.caption'), '', 'Setup acknowledgments are not spoken subtitles');
  assert.equal(await sessionCount(), 1, 'A language change must not open another avatar session');
  assert.equal(await page.evaluate('window.checks.providerMicrophones'), 0);
  assert.equal(await page.evaluate(`document.querySelector('select').value`), 'gaa');
  assert.ok(await page.evaluate(`document.body.innerText.includes('not explicitly listed')`));
  await page.evaluate(`window.emitBrain('malvi:brain_language_error',{sessionId:'11111111-1111-4111-8111-111111111111',message:'Selected language could not be applied.'});true`);
  await page.wait(`window.checks.sdkStops===1`);
  assert.equal(await sessionCount(), 1, 'Failed updates must not auto-start another paid session');
  await page.evaluate(`window.overlay.onClose();true`);
  await page.wait(`!document.querySelector('[data-live-overlay]')`);
  await click('Check Redis connection');
  await page.wait(`document.body.innerText.includes('Redis: connected')`);
  assert.equal(await sessionCount(), 1, 'Diagnostics must not initialize a session');
  await click('Test voice only');
  await page.wait(`window.checks.requests.some(r=>r.url.endsWith('/voice-session'))`);
  assert.equal(await page.evaluate('window.checks.sdkCreations'), 1, 'Voice-only test must never create an avatar SDK');
  assert.equal(await page.evaluate('window.overlay.voiceOnly'), true);
  await page.evaluate(`window.emitBrain('malvi:brain_ready',{sessionId:'11111111-1111-4111-8111-111111111111',provider:'gemini',language:'gaa'});true`);
  await page.wait(`window.overlay.brainReady===true && window.overlay.phase==='connected'`);
  assert.equal(await page.evaluate('Boolean(document.querySelector("video"))'), false, 'Voice-only UI must not show a fake live video');
  assert.ok(await page.evaluate(`document.body.innerText.includes('Voice connected · no avatar')`));
  if (process.env.NANIVIO_SCREENSHOT_DIR) await page.screenshot(path.join(process.env.NANIVIO_SCREENSHOT_DIR, 'malvi-voice-only-mobile.png'));
  assert.equal(await page.evaluate('window.overlay.microphoneOn'), false, 'Voice-only connection must not start microphone automatically');
  await page.evaluate(`window.emitBrain('malvi:brain_audio',{sessionId:'11111111-1111-4111-8111-111111111111',language:'gaa',pcm24k:'AAAAAA==',sampleRate:24000,format:'pcm_s16le',channels:1,durationMs:1,alignment:{characters:['H'],character_start_times_seconds:[0],character_end_times_seconds:[0.00008]}});true`);
  await page.wait('window.checks.voicePlayed===1');
  await page.evaluate(`window.overlay.onInterrupt();true`);
  await page.wait(`window.checks.messages.some(m=>m.type==='malvi:brain_interrupt')`);
  assert.ok(await page.evaluate('window.checks.voiceInterrupted>=1'));
  await page.evaluate(`window.overlay.onClose();true`);
  await page.wait('window.checks.audioClosed>=1');
  assert.equal(await page.evaluate('window.checks.sdkCreations'), 1);
  await page.evaluate(`window.speechSupport=['en','fr','ar'];window.refreshFixture();true`);
  await page.wait(`Boolean(document.body.innerText.includes('current ElevenLabs voice model'))`);
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Start live avatar')).disabled`), true);
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Test voice only')).disabled`), true);
  assert.ok(await page.evaluate(`document.body.innerText.includes('not substitute English or another voice')`));
  console.log(JSON.stringify({ mobileWidths: [320,390,768], appLanguageSelector: true, noIdleProviderOrMicrophone: true, cancellableWakeSetup: true, explicitLocalPackInstall: true, stoppedAndHiddenWakeCannotActivate: true, onceOnlyHeyMalviActivation: true, selectedLanguageSentToBackend: true, noEnglishWelcome: true, activeLanguageUpdateWithoutNewAvatar: true, unverifiedLanguageWarning: true, failedUpdatesCloseRatherThanFallBack: true }));
} finally {
  await browser.close();
}
