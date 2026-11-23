import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real React controller, microphone AudioWorklet and AudioBufferSource playback.
// Provider/session events and microphone acoustic-processing metadata are fixtures.
// No human recording, account login, external network request or provider credits.
const modules = {
  context: `
    import React from 'react';
    const Context=React.createContext(null);
    export function FixtureContextProvider({children}){
      const[appLanguage,setAppLanguage]=React.useState('en');
      window.changeLanguage=setAppLanguage;
      return React.createElement(Context.Provider,{value:{
        currentUser:{id:'fixture-owner',appLanguage:'en'},appLanguage,setAppLanguage,
        setPendingBillingAction:()=>{},setActiveTab:()=>{}
      }},children);
    }
    export const useNanivio=()=>React.useContext(Context);`,
  auth: `export const authClient={getToken:()=>null};`,
  realtime: `
    const handlers=new Map();
    window.fixture={sent:[],micStarts:0,micStops:0,interrupts:0,playbackStops:0,
      sourceStarts:0,frames:0,permissionDenied:false,errors:[],delayAck:false};
    window.emit=(type,payload)=>{for(const fn of handlers.get(type)||[])fn(payload)};
    export const realtimeClient={
      connect(){},
      on(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);return()=>handlers.get(type).delete(fn)},
      send(type,payload){
        const f=window.fixture;
        if(type!=='nanivio:mic_audio')f.sent.push({type,payload});
        if(type==='malvi:brain_start')queueMicrotask(()=>window.emit('malvi:brain_ready',{
          sessionId:payload.sessionId,language:payload.language,speechProvider:'gemini'
        }));
        if(type==='nanivio:mic_start')window.emit('nanivio:mic_status',{
          sessionId:payload.sessionId,streamId:payload.streamId,version:1,state:'ready'
        });
        if(type==='nanivio:mic_audio'){
          f.frames++;
          window.emit('nanivio:mic_status',{sessionId:payload.sessionId,streamId:payload.streamId,
            version:1,state:'receiving',lastSequence:payload.sequence});
        }
        if(type==='malvi:brain_interrupt'){
          f.interrupts++;
          if(!f.delayAck)queueMicrotask(()=>window.emit('malvi:brain_interrupted',{sessionId:payload.sessionId}));
        }
        if(type==='malvi:brain_language')queueMicrotask(()=>window.emit('malvi:brain_language',{
          sessionId:payload.sessionId,language:payload.language,source:'selection'
        }));
        return true;
      }
    };`,
  overlay: `
    import React from 'react';
    export function MalviLiveOverlay(props){
      window.overlay=props;
      return React.createElement('section',{'data-fixture-overlay':true},
        React.createElement('p',null,props.inputState),
        React.createElement('p',null,props.microphoneError),
        React.createElement('button',{id:'toggle-mic',onClick:props.onToggleMicrophone},'Toggle microphone'),
        React.createElement('button',{id:'interrupt',onClick:props.onInterrupt},'Interrupt'),
        React.createElement('button',{id:'close',onClick:props.onClose},'End session'));
    }`,
};
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{FixtureContextProvider}from'./src/context/NanivioContext';
    import{MalviLiveAssistantProvider,MalviLiveControls}from'./src/components/malvi/MalviLiveAssistant';
    window.addEventListener('error',e=>window.fixture.errors.push(e.message));
    window.addEventListener('unhandledrejection',()=>window.fixture.errors.push('unhandled rejection'));
    const id='11111111-1111-4111-8111-111111111111';
    window.fetch=async(url,options={})=>{
      if(url==='/api/assistant/status')return Response.json({success:true,enabled:true,configured:true,
        voiceAvailable:true,brainProvider:'gemini',speech:{provider:'gemini',configured:true,supportedLanguages:['en','ar','fr']}});
      if(url==='/api/assistant/voice')return Response.json({success:true,id,mode:'VOICE_ONLY',
        serverNow:Date.now(),idleDeadline:Date.now()+60000,hardDeadline:Date.now()+120000});
      if(String(url).endsWith('/allowance'))return Response.json({success:true,remainingSeconds:120,serverNow:Date.now()});
      if(String(url).endsWith('/end')||String(url).endsWith('/activity'))return Response.json({
        success:true,serverNow:Date.now(),idleDeadline:Date.now()+60000,hardDeadline:Date.now()+120000});
      throw Error('Unexpected network request in isolated fixture');
    };
    const nativeResume=AudioContext.prototype.resume,nativeSource=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.resume=function(){
      if(window.holdResume&&this.sampleRate===24000)return new Promise((resolve,reject)=>{window.rejectOldPlayback=reject});
      return nativeResume.call(this);
    };
    AudioContext.prototype.createBufferSource=function(){
      const source=nativeSource.call(this),stop=source.stop.bind(source),start=source.start.bind(source);
      source.stop=(...args)=>{window.fixture.playbackStops++;return stop(...args)};
      source.start=(...args)=>{window.fixture.sourceStarts++;return start(...args)};
      return source;
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      if(window.fixture.permissionDenied)throw new DOMException('denied','NotAllowedError');
      window.fixture.micStarts++;
      const context=window.inputContext=new AudioContext({sampleRate:48000});await context.resume();
      const oscillator=context.createOscillator(),gain=window.inputGain=context.createGain();
      const destination=context.createMediaStreamDestination();gain.gain.value=0;
      oscillator.connect(gain);gain.connect(destination);oscillator.start();
      const track=window.inputTrack=destination.stream.getAudioTracks()[0];
      const settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),echoCancellation:true});
      const stop=track.stop.bind(track);track.stop=()=>{window.fixture.micStops++;stop();oscillator.stop();void context.close()};
      return destination.stream;
    };
    window.reply=(language='en',seconds=3)=>{
      const samples=new Int16Array(24000*seconds);
      for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i/24000*2*Math.PI*300)*1200;
      const bytes=new Uint8Array(samples.buffer);let raw='';
      for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
      window.emit('malvi:brain_audio',{sessionId:id,language,pcm24k:btoa(raw),sampleRate:24000,
        format:'pcm_s16le',channels:1,durationMs:seconds*1000,speechDurationMs:seconds*1000,
        text:'This is synthetic test speech audio, not a real provider response.',speechProvider:'gemini',captionTiming:'estimated'});
    };
    createRoot(document.getElementById('root')).render(
      <FixtureContextProvider><MalviLiveAssistantProvider><MalviLiveControls/></MalviLiveAssistantProvider></FixtureContextProvider>);
  ` },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  plugins: [{ name: 'isolated-malvi-transport', setup(b) {
    for (const [pattern, name] of [
      [/\/NanivioContext$/, 'context'], [/\/authClient$/, 'auth'],
      [/\/realtimeClient$/, 'realtime'], [/\/MalviLiveOverlay$/, 'overlay'],
    ]) b.onResolve({ filter: pattern }, () => ({ path: name, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd() }));
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
  const page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  const gesture = async expression => {
    const result = await page.command('Runtime.evaluate', { expression, userGesture: true, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  };
  await page.wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Start voice')&&!b.disabled)`);
  assert.equal(await page.evaluate('window.fixture.micStarts'), 0, 'No idle capture before explicit activation');
  await gesture(`document.querySelector('button').click();true`);
  await page.wait('window.overlay?.microphoneOn===true&&window.fixture.frames>2');
  assert.equal(await page.evaluate('window.fixture.micStarts'), 1);

  // This is 31 seconds of real browser playback/capture, not just a fake clock.
  await page.evaluate('window.reply("en",35);true');
  await page.wait('window.fixture.sourceStarts>0');
  const before = await page.evaluate('window.fixture.frames');
  await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),31000))');
  assert.ok(await page.evaluate('window.fixture.frames') >= before + 140);
  assert.equal(await page.evaluate('window.fixture.micStarts'), 1);
  assert.equal(await page.evaluate('window.overlay.microphoneOn'), true);
  assert.equal(await page.evaluate('window.fixture.interrupts'), 0, 'Synthetic silent microphone must not self-interrupt');

  const interruptionAt = Date.now();
  await page.evaluate('window.inputGain.gain.value=0.1;true');
  await page.wait('window.fixture.interrupts===1', 2500);
  const interruptionMs = Date.now() - interruptionAt;
  assert.ok(await page.evaluate('window.fixture.playbackStops') >= 1, 'Stop the actual AudioBufferSource, not just UI');
  assert.equal(await page.evaluate('window.overlay.microphoneOn'), true);
  await page.evaluate('window.inputGain.gain.value=0;true');
  await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),450))');

  for (const language of ['ar', 'fr']) {
    await page.evaluate(`window.changeLanguage(${JSON.stringify(language)});true`);
    await page.wait(`window.overlay.languageCode===${JSON.stringify(language)}&&window.overlay.brainReady===true`);
    assert.equal(await page.evaluate('window.fixture.micStarts'), 1, 'Language updates keep the same microphone');
    const interrupts = await page.evaluate('window.fixture.interrupts');
    await page.evaluate(`window.reply(${JSON.stringify(language)});true`);
    await page.evaluate('window.inputGain.gain.value=0.1;true');
    await page.wait(`window.fixture.interrupts===${interrupts + 1}`, 2500);
    await page.evaluate('window.inputGain.gain.value=0;true');
    await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),450))');
  }

  // A late resume rejection must not restore old audio after cancellation.
  await page.evaluate('window.holdResume=true;window.reply("fr");true');
  await page.wait('typeof window.rejectOldPlayback==="function"');
  await gesture('document.querySelector("#interrupt").click();true');
  await page.evaluate('window.rejectOldPlayback(Error("late blocked audio"));window.holdResume=false;true');
  await page.wait('window.overlay.interrupted===true');
  assert.equal(await page.evaluate('window.overlay.audioBlocked'), false);

  // A deliberate pause is retained across language changes.
  await gesture('document.querySelector("#toggle-mic").click();true');
  await page.wait('window.overlay.microphoneOn===false');
  await page.evaluate('window.changeLanguage("en");true');
  await page.wait('window.overlay.languageCode==="en"&&window.overlay.brainReady===true');
  assert.equal(await page.evaluate('window.fixture.micStarts'), 1);

  await gesture('document.querySelector("#toggle-mic").click();true');
  await page.wait('window.overlay.microphoneOn===true&&window.fixture.micStarts===2');
  await page.evaluate('window.inputTrack.onended();true');
  await page.wait('window.overlay.microphoneOn===false&&window.overlay.microphoneError.length>0');
  assert.match(await page.evaluate('window.overlay.microphoneError'), /device|microphone/i);
  await page.evaluate('window.fixture.permissionDenied=true;true');
  await gesture('document.querySelector("#toggle-mic").click();true');
  await page.wait('window.overlay.microphoneError.includes("denied")');
  assert.equal(await page.evaluate('window.overlay.microphoneOn'), false);
  await page.evaluate('window.fixture.permissionDenied=false;true');
  await gesture('document.querySelector("#toggle-mic").click();true');
  await page.wait('window.overlay.microphoneOn===true&&window.fixture.micStarts===3');
  await page.evaluate('window.emit("connection:lost",{});true');
  await page.wait('window.overlay.phase==="error"&&window.overlay.microphoneOn===false');
  assert.deepEqual(await page.evaluate('window.fixture.errors'), []);
  console.log(JSON.stringify({
    realReactController: true, realAudioWorklet: true, continuousPlaybackAndCaptureSeconds: 31,
    actualAudioSourcesStopped: true, syntheticInputToStopObservedMs: interruptionMs,
    repeatedBargeIn: true, languagePreservesCapture: true, deliberatePauseRespected: true,
    stalePlaybackRejected: true, deviceLossAndPermissionRecovery: true, networkLossStopsCapture: true,
    physicalEchoCancellationVerified: false, liveVoiceOrLipSyncVerified: false, providerRequests: 0,
  }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
