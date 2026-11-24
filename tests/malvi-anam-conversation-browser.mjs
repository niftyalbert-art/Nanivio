import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real React controller, Anam adapter, paired MediaStream playout and AudioWorklet.
// Local transport/Anam fixtures only: no account, provider requests or credits.
const modules = {
  context: `import React from 'react';export const useNanivio=()=>({
    currentUser:{id:'fixture-owner'},appLanguage:'en',setPendingBillingAction(){},setActiveTab(){}
  });`,
  auth: `export const authClient={getToken:()=>null};`,
  overlay: `import React from 'react';export function MalviLiveOverlay(p){
    window.overlay=p;return React.createElement('video',{ref:p.onVideoElement,autoPlay:true,playsInline:true});
  }`,
  realtime: `
    const handlers=new Map();
    window.fixture={frames:0,micStarts:0,interrupts:0,sessions:0,ends:0,errors:[],rendererDownloaded:false};
    window.emit=(type,payload)=>{for(const fn of handlers.get(type)||[])fn(payload)};
    export const realtimeClient={connect(){},on(type,fn){
      if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);
      return()=>handlers.get(type).delete(fn);
    },send(type,p){
      if(type==='malvi:brain_start')queueMicrotask(()=>window.emit('malvi:brain_ready',{
        sessionId:p.sessionId,language:'en',speechProvider:'gemini'
      }));
      if(type==='nanivio:mic_start')window.emit('nanivio:mic_status',{
        sessionId:p.sessionId,streamId:p.streamId,version:1,state:'ready'});
      if(type==='nanivio:mic_audio'){window.fixture.frames++;window.emit('nanivio:mic_status',{
        sessionId:p.sessionId,streamId:p.streamId,version:1,state:'receiving',lastSequence:p.sequence});}
      if(type==='malvi:brain_interrupt'){window.fixture.interrupts++;queueMicrotask(
        ()=>window.emit('malvi:brain_interrupted',{sessionId:p.sessionId}));}
      return true;
    }};`,
  anam: `
    window.fixture.rendererDownloaded=true;
    export const AnamEvent={CONNECTION_CLOSED:'closed'};
    export function createClient(){
      let active=false,context,oscillator,gain,canvasTimer,outputTimer,tracks=[];
      return {addListener(){},getActiveSessionId:()=>active?'fixture-anam':null,isStreaming:()=>active,
        async stream(){
          context=new AudioContext({sampleRate:48000});await context.resume();
          oscillator=context.createOscillator();gain=context.createGain();gain.gain.value=0;
          const destination=context.createMediaStreamDestination();oscillator.connect(gain);
          gain.connect(destination);oscillator.start();
          const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
          const draw=()=>{canvas.getContext('2d').fillStyle=Date.now()%2?'#246':'#468';
            canvas.getContext('2d').fillRect(0,0,160,160)};
          draw();canvasTimer=setInterval(draw,40);
          const video=canvas.captureStream(25);tracks=[...video.getTracks(),...destination.stream.getTracks()];
          active=true;return[video,destination.stream];
        },
        createAgentAudioInputStream:()=>({sendAudioChunk(){
          gain.gain.value=0.12;clearTimeout(outputTimer);
          outputTimer=setTimeout(()=>gain.gain.value=0,600);
        },endSequence(){}}),
        interruptPersona(){gain.gain.value=0;},
        async stopStreaming(){active=false;clearInterval(canvasTimer);clearTimeout(outputTimer);
          tracks.forEach(t=>t.stop());oscillator.stop();await context.close();}
      };
    }`,
};
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{MalviLiveAssistantProvider,MalviLiveControls}from'./src/components/malvi/MalviLiveAssistant';
    const id='11111111-1111-4111-8111-111111111111';
    window.addEventListener('error',e=>window.fixture.errors.push(e.message));
    window.addEventListener('unhandledrejection',()=>window.fixture.errors.push('unhandled rejection'));
    const nativeResume=AudioContext.prototype.resume;
    AudioContext.prototype.resume=function(){
      // Model browsers that require microphone-context unlock in the Start tap.
      if(this.sampleRate===16000&&!window.activationGesture)return Promise.reject(Error('Missed microphone user activation'));
      return nativeResume.call(this);
    };
    const realFetch=window.fetch.bind(window);
    window.fetch=async(url,options={})=>{
      if(String(url).startsWith('/audio/'))return realFetch(url,options);
      if(url==='/api/assistant/status')return Response.json({success:true,enabled:true,configured:true,
        renderer:'anam',brainProvider:'gemini',speech:{provider:'gemini',configured:true,supportedLanguages:['en']}});
      if(url==='/api/assistant/session'){
        window.fixture.sessions++;await new Promise(r=>setTimeout(r,80));
        if(!window.fixture.rendererDownloaded)throw Error('Renderer download did not overlap session setup');
        return Response.json({success:true,id,sessionToken:'fixture',renderer:'anam',
          serverNow:Date.now(),idleDeadline:Date.now()+60000,hardDeadline:Date.now()+120000});
      }
      if(String(url).endsWith('/allowance'))return Response.json({success:true,remainingSeconds:120,serverNow:Date.now()});
      if(String(url).endsWith('/end')){window.fixture.ends++;return Response.json({success:true});}
      if(String(url).endsWith('/activity'))return Response.json({success:true,serverNow:Date.now(),
        idleDeadline:Date.now()+60000,hardDeadline:Date.now()+120000});
      throw Error('Unexpected fixture request');
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      window.fixture.micStarts++;
      const context=window.inputContext=new AudioContext({sampleRate:48000});await context.resume();
      const source=context.createOscillator(),gain=window.inputGain=context.createGain();
      const destination=context.createMediaStreamDestination();gain.gain.value=0;
      source.connect(gain);gain.connect(destination);source.start();
      const track=destination.stream.getAudioTracks()[0],settings=track.getSettings.bind(track);
      track.getSettings=()=>({...settings(),echoCancellation:true});
      return destination.stream;
    };
    window.reply=()=>{
      const samples=new Int16Array(24000*.6);for(let i=0;i<samples.length;i++)samples[i]=1200;
      let raw='';const bytes=new Uint8Array(samples.buffer);
      for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
      window.emit('malvi:brain_audio',{sessionId:id,language:'en',pcm24k:btoa(raw),
        sampleRate:24000,format:'pcm_s16le',channels:1,durationMs:600,speechDurationMs:600,
        text:'Synthetic reply.',speechProvider:'gemini',captionTiming:'estimated',ended:true});
      window.emit('malvi:brain_turn_end',{sessionId:id});
    };
    createRoot(document.getElementById('root')).render(
      <MalviLiveAssistantProvider><MalviLiveControls/></MalviLiveAssistantProvider>);
  ` }, bundle: true, format: 'iife', platform: 'browser', write: false,
  plugins: [{ name: 'isolated-avatar-conversation', setup(b) {
    for (const [filter, name] of [[/\/NanivioContext$/, 'context'], [/\/authClient$/, 'auth'],
      [/\/realtimeClient$/, 'realtime'], [/\/MalviLiveOverlay$/, 'overlay'], [/^@anam-ai\/js-sdk$/, 'anam']])
      b.onResolve({ filter }, () => ({ path: name, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd(),
    }));
  } }],
});
const processor = await readFile('public/audio/nanivio-mic-processor.js', 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/' ? 'text/html' : 'text/javascript');
  res.end(req.url === '/' ? '<!doctype html><div id="root"></div><script src="/bundle.js"></script>'
    : req.url.startsWith('/audio/') ? processor : bundle.outputFiles[0].text);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
  await page.wait('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Start live avatar")&&!b.disabled)');
  await page.command('Runtime.evaluate', { userGesture: true, expression: `window.activationGesture=true;
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Start live avatar')).click();
    window.activationGesture=false;true;` });
  await page.wait('window.overlay?.phase==="connected"&&window.overlay.microphoneOn&&window.fixture.frames>=2', 10000);
  for (let turn = 0; turn < 2; turn++) {
    await page.evaluate('window.reply();true');
    await page.wait('window.overlay.speaking===true', 3500);
    await page.wait('window.overlay.speaking===false', 3500);
    const frames = await page.evaluate('window.fixture.frames');
    await page.evaluate('window.inputGain.gain.value=.1;true');
    await page.evaluate('new Promise(r=>setTimeout(()=>r(true),850))');
    await page.evaluate('window.inputGain.gain.value=0;true');
    assert.ok(await page.evaluate('window.fixture.frames') > frames, 'Microphone continues after avatar speech');
    assert.equal(await page.evaluate('window.fixture.interrupts'), 0, 'Completed playback must not trigger a stale interruption');
  }
  assert.equal(await page.evaluate('window.fixture.micStarts'), 1);
  assert.equal(await page.evaluate('window.fixture.sessions'), 1);
  assert.deepEqual(await page.evaluate('window.fixture.errors'), []);
  await page.evaluate('window.overlay.onClose();true');
  await page.wait('window.fixture.ends===1');
  await page.evaluate('window.inputContext.close();true');
  console.log('PASS: renderer download overlaps connection; microphone gesture survives delayed startup; two Anam-style replies complete without vendor speech events, stale interruptions or microphone restart. Local fixtures, no live inference or provider credits.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
