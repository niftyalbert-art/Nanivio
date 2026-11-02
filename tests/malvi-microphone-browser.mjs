import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Run the real public AudioWorklet in Chromium's audio rendering thread.
// Oscillator input avoids microphone permission, human recordings and providers.
const worklet = await readFile(new URL('../public/audio/nanivio-mic-processor.js', import.meta.url), 'utf8');
const capture=await build({stdin:{resolveDir:process.cwd(),contents:"import {BrowserMicCapture} from './src/lib/nanivioMic/BrowserMicCapture'; window.BrowserMicCapture=BrowserMicCapture;"},
  bundle:true,write:false,format:'esm',platform:'browser'});
const server = createServer((req, res) => {
  const processor=req.url.startsWith('/processor.js')||req.url.startsWith('/audio/nanivio-mic-processor.js');
  res.setHeader('Content-Type',processor||req.url==='/capture.js'?'text/javascript':'text/html');
  res.end(processor?worklet:req.url==='/capture.js'?capture.outputFiles[0].text:
    '<!doctype html><title>Malvi microphone regression</title><script type="module" src="/capture.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  for (const [rate,channels] of [[16000,1],[44100,1],[48000,1],[16000,2],[44100,2],[48000,2]]) {
  const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
  await page.command('Runtime.evaluate', {
    userGesture: true, awaitPromise: true,
    expression: `(async()=>{
      window.frames=[];window.processorFailed=false;
      const context=window.testContext=new AudioContext({sampleRate:${rate}});
      await context.resume();
      await context.audioWorklet.addModule('/processor.js');
      const processor=window.processor=new AudioWorkletNode(context,'nanivio-mic-processor');
      processor.onprocessorerror=()=>{window.processorFailed=true;};
      processor.port.onmessage=event=>{
        const bytes=event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : Uint8Array.from(atob(event.data),c=>c.charCodeAt(0));
        const view=new DataView(bytes.buffer);
        let peak=0;for(let i=0;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(view.getInt16(i,true)));
        window.frames.push({bytes:bytes.length,peak});
      };
      const oscillator=window.oscillator=context.createOscillator();
      oscillator.frequency.value=440;
      const silent=context.createGain();silent.gain.value=0;
      if(${channels}===2){
        const stereo=context.createChannelMerger(2);
        oscillator.connect(stereo,0,1);stereo.connect(processor);
      }else oscillator.connect(processor);
      processor.connect(silent);silent.connect(context.destination);
      oscillator.start();
      return true;
    })()`,
  });
  await page.wait('window.frames.length>=3||window.processorFailed', 8000);
  assert.equal(await page.evaluate('window.processorFailed'), false, 'The real AudioWorklet must not crash before sending microphone PCM');
  const frames = await page.evaluate('window.frames.slice(0,3)');
  assert.equal(frames.length, 3);
  assert.ok(frames.every(f => f.bytes === 6400 && f.peak > 1000), `${channels}-channel ${rate}Hz input must send voiced PCM16, including right-only speech`);
  await page.evaluate('window.oscillator.stop();window.processor.disconnect();window.testContext.close();true');
  assert.equal(await page.evaluate('window.testContext.sampleRate'),rate);
  }
  const page=await browser.page(`http://127.0.0.1:${server.address().port}`);
  await page.wait('typeof window.BrowserMicCapture==="function"');
  await page.command('Runtime.evaluate',{userGesture:true,awaitPromise:true,expression:`(async()=>{
    window.captureFrames=[];window.captureErrors=[];
    const source=window.sourceContext=new AudioContext({sampleRate:48000});await source.resume();
    const oscillator=window.sourceOscillator=source.createOscillator();oscillator.frequency.value=440;
    const stereo=source.createChannelMerger(2),destination=source.createMediaStreamDestination();
    oscillator.connect(stereo,0,1);stereo.connect(destination);oscillator.start();
    navigator.mediaDevices.getUserMedia=async constraints=>{window.requestedConstraints=constraints;return destination.stream;};
    window.captureDriver=new window.BrowserMicCapture();
    await window.captureDriver.start(frame=>{
      const data=new DataView(frame);let peak=0;
      for(let i=0;i<frame.byteLength;i+=2)peak=Math.max(peak,Math.abs(data.getInt16(i,true)));
      window.captureFrames.push({bytes:frame.byteLength,peak});
    },error=>window.captureErrors.push(error),new AbortController().signal);
    return true;
  })()`});
  await page.wait('window.captureFrames.length>=3||window.captureErrors.length>0');
  assert.deepEqual(await page.evaluate('window.captureErrors'),[]);
  assert.ok((await page.evaluate('window.captureFrames.slice(0,3)')).every(frame=>frame.bytes===6400&&frame.peak>1000),
    'The actual capture adapter must deliver right-channel speech through its real audio graph');
  assert.equal(await page.evaluate('window.requestedConstraints.audio.echoCancellation'),true);
  await page.evaluate('window.captureDriver.stop();window.stoppedFrameCount=window.captureFrames.length;window.sourceOscillator.stop();window.sourceContext.close();true');
  await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),450))');
  assert.equal(await page.evaluate('window.captureFrames.length===window.stoppedFrameCount'),true);
  console.log(JSON.stringify({realAudioWorklet:true,realCaptureAdapter:true,nativeRates:[16000,44100,48000],
    rightChannelSpeech:true,stopPreventsLateFrames:true,normalizedRate:16000,bytesPerFrame:6400,providerRequests:0}));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
