// Real browser + installed Agora track + synthetic tones only. No accounts,
// RTC channel joins, provider requests, microphone permission or live database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  import AgoraRTC from 'agora-rtc-sdk-ng';
  import {CallTranslationMixer} from './src/lib/callTranslationMixer.ts';
  AgoraRTC.setLogLevel(4);
  window.runProbe=async()=>{
    const context=new AudioContext();
    await context.resume();
    const oscillator=context.createOscillator();oscillator.frequency.value=440;
    const microphone=context.createMediaStreamDestination();
    oscillator.connect(microphone);oscillator.start();
    const original=microphone.stream.getAudioTracks()[0];
    const mixer=new CallTranslationMixer(context,original);
    const output=mixer.track;
    const track=AgoraRTC.createCustomAudioTrack({mediaStreamTrack:output,encoderConfig:'speech_standard'});
    await track.setMuted(false);
    const sdkTrackBefore=track.getMediaStreamTrack();
    const analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;
    const observer=context.createMediaStreamSource(new MediaStream([output]));
    observer.connect(analyser);
    const silent=context.createGain();silent.gain.value=0;
    analyser.connect(silent);silent.connect(context.destination);
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const levels=()=>{
      const bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);
      const peak=hz=>{
        const index=Math.round(hz*analyser.fftSize/context.sampleRate);
        return Math.max(...bins.slice(index-1,index+2));
      };
      return {microphoneDb:peak(440),translationDb:peak(880)};
    };
    const measure=async which=>{
      const deadline=performance.now()+2500;
      while(performance.now()<deadline){
        const value=levels();
        if(which==='microphone'
          ?Number.isFinite(value.microphoneDb)&&value.microphoneDb>value.translationDb+12
          :Number.isFinite(value.translationDb)&&value.translationDb>value.microphoneDb+12)return value;
        await wait(25);
      }
      throw new Error('Expected native '+which+' tone was not rendered.');
    };
    const speech=seconds=>{
      const buffer=context.createBuffer(1,Math.round(context.sampleRate*seconds),context.sampleRate);
      const channel=buffer.getChannelData(0);
      for(let i=0;i<channel.length;i++)channel[i]=0.3*Math.sin(2*Math.PI*880*i/context.sampleRate);
      return buffer;
    };
    const before=await measure('microphone');
    const playing=mixer.play(speech(1.2));
    const during=await measure('translation');
    const played=await playing;
    const after=await measure('microphone');
    await track.setMuted(true);await track.setMuted(false);
    const mutePreservedTrack=sdkTrackBefore===track.getMediaStreamTrack()
      &&output.readyState==='live'&&original.readyState==='live';
    const interrupted=mixer.play(speech(1));
    mixer.dispose();
    const cancelled=await interrupted===false;
    const borrowedResourcesPreserved=original.readyState==='live'&&context.state==='running';
    const outputReleased=output.readyState==='ended';
    observer.disconnect();oscillator.stop();original.stop();track.close();await context.close();
    return {contextRan:true,before,during,after,played,mutePreservedTrack,
      cancelled,borrowedResourcesPreserved,outputReleased};
  };
`},bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent'});
const server=createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local audio mixer check</title><script src="/fixture.js"></script>');}
  else if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await launchBrowser({commandTimeoutMs:12000});
  const page=await browser.page('about:blank');
  await page.command('Network.enable');
  await page.command('Network.setBlockedURLs',{urls:['https://*','wss://*']});
  await page.command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await page.wait('typeof window.runProbe==="function"',10000);
  const evaluation=await page.command('Runtime.evaluate',{
    expression:'window.runProbe()',awaitPromise:true,returnByValue:true,userGesture:true,timeout:10000,
  });
  assert.ok(!evaluation.exceptionDetails,JSON.stringify(evaluation.exceptionDetails));
  const result=evaluation.result.value;
  console.log(JSON.stringify({stage:'native_audio_measurement',result}));
  assert.equal(result.played,true);
  assert.ok(result.before.microphoneDb>result.before.translationDb+12);
  assert.ok(result.during.translationDb>result.during.microphoneDb+12);
  assert.ok(result.after.microphoneDb>result.after.translationDb+12);
  for(const key of ['mutePreservedTrack','cancelled','borrowedResourcesPreserved','outputReleased'])
    assert.equal(result[key],true,key);
  await fs.mkdir('generated-artifacts/translation-mixer-browser',{recursive:true});
  await fs.writeFile('generated-artifacts/translation-mixer-browser/results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({success:true,realBrowser:true,realSdkAudioTrack:true,paidCalls:0,result}));
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
