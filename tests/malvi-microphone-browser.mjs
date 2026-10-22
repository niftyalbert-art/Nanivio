import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Run the real public AudioWorklet in Chromium's audio rendering thread.
// Oscillator input avoids microphone permission, human recordings and providers.
const worklet = await readFile(new URL('../public/audio/nanivio-mic-processor.js', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url.startsWith('/processor.js') ? 'text/javascript' : 'text/html');
  res.end(req.url.startsWith('/processor.js') ? worklet : '<!doctype html><title>Malvi microphone regression</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser();
try {
  for (const rate of [16000, 44100, 48000]) {
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
      oscillator.connect(processor);processor.connect(silent);silent.connect(context.destination);
      oscillator.start();
      return true;
    })()`,
  });
  await page.wait('window.frames.length>=3||window.processorFailed', 8000);
  assert.equal(await page.evaluate('window.processorFailed'), false, 'The real AudioWorklet must not crash before sending microphone PCM');
  const frames = await page.evaluate('window.frames.slice(0,3)');
  assert.equal(frames.length, 3);
  assert.ok(frames.every(f => f.bytes === 6400 && f.peak > 1000), 'Send voiced little-endian PCM16, 200 ms per 16 kHz frame');
  await page.evaluate('window.oscillator.stop();window.processor.disconnect();window.testContext.close();true');
  assert.equal(await page.evaluate('window.testContext.sampleRate'),rate);
  }
  console.log(JSON.stringify({ realAudioWorklet: true, nativeRates: [16000,44100,48000], normalizedRate:16000, bytesPerFrame: 6400, providerRequests: 0 }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
