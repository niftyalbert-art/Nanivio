/**
 * Explicitly paid, one-session Anam renderer probe. Not a production auth bypass.
 * Run only after approval: node --import tsx scripts/malvi-anam-live-probe.ts
 * Uses the saved, owner-approved Malvi reference; no new TTS request or mic.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createAnamAvatarProvider } from '../src/server/assistant/anamAvatar';
import { wavToPcm24k } from '../src/server/assistant/pcm';
import { launchBrowser } from './live-call-checks/cdp.mjs';

const output = 'generated-artifacts/malvi-anam-live-check';
const reference = await readFile('generated-artifacts/malvi-british-ghanaian-fuller-echo.wav');
const pcm = Buffer.from(wavToPcm24k(reference), 'base64').subarray(0, 24000 * 2 * 6).toString('base64');
const provider = createAnamAvatarProvider();
const cookie = `nanivio_anam_probe=${randomBytes(24).toString('hex')}`;
let session: Awaited<ReturnType<typeof provider.create>> | undefined;
let stopWork: Promise<void> | undefined;
let stopped = false;
const stop = () => {
  if (!session) return Promise.resolve();
  return stopWork ||= provider.stop(session.providerId).then(() => { stopped = true; }).catch(error => {
    stopWork = undefined; throw error;
  });
};
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import {MalviAnamAvatarSession} from './src/lib/malviAnamAvatarSession';
    const video=document.querySelector('video');
    window.probe={ready:false,frames:0,audioPeaks:0,firstOutputMs:null,pcmSentAt:0,micRequests:0};
    navigator.mediaDevices.getUserMedia=async()=>{window.probe.micRequests++;throw Error('Renderer microphone forbidden');};
    let live,context,analyser,raf;
    function observe(){
      if(analyser){
        const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);
        const rms=Math.sqrt(values.reduce((a,b)=>a+b*b,0)/values.length);
        if(rms>.003&&!video.paused&&!video.muted){
          window.probe.audioPeaks++;
          if(window.probe.pcmSentAt&&window.probe.firstOutputMs===null)
            window.probe.firstOutputMs=Math.round(performance.now()-window.probe.pcmSentAt);
        }
      }
      raf=requestAnimationFrame(observe);
    }
    window.begin=async()=>{
      context=new AudioContext();await context.resume();
      const info=await(await fetch('/session')).json();
      live=new MalviAnamAvatarSession('probe',info.sessionToken);
      live.on('ready',()=>live.attach(video));
      live.on('closed',()=>window.probe.closed=true);
      await live.start();await video.play();
      const source=context.createMediaStreamSource(video.srcObject);
      analyser=context.createAnalyser();source.connect(analyser);
      const frame=()=>{window.probe.frames++;video.requestVideoFrameCallback(frame)};
      video.requestVideoFrameCallback(frame);observe();
      window.probe.ready=true;window.probe.width=video.videoWidth;window.probe.height=video.videoHeight;
      window.probe.audioTracks=video.srcObject.getAudioTracks().length;
      window.probe.videoTracks=video.srcObject.getVideoTracks().length;
    };
    window.speak=async(seconds=6)=>{
      const {pcm}=await(await fetch('/speech')).json(),bytes=atob(pcm).slice(0,seconds*48000);
      window.probe.pcmSentAt=performance.now();window.probe.firstOutputMs=null;
      for(let i=0;i<bytes.length;i+=9600)live.appendAudio(btoa(bytes.slice(i,i+9600)),i+9600>=bytes.length);
    };
    window.interrupt=()=>{
      const start=performance.now();live.interrupt();
      window.probe.locallyMuted=video.muted;
      window.probe.interruptCommandMs=performance.now()-start;
    };
    window.end=async()=>{
      cancelAnimationFrame(raf);
      await live?.stop();await context?.close();
      window.probe.tracksStopped=video.srcObject?.getTracks().every(t=>t.readyState==='ended')??true;
    };
    window.loaded=true;
  ` },
  bundle: true, write: false, format: 'iife',
});
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/') {
    res.setHeader('Set-Cookie', `${cookie}; HttpOnly; SameSite=Strict; Path=/`);
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;background:#080e19;color:white;font:16px sans-serif">'
      + '<h3 style="padding:0 16px">Malvi · live Anam verification</h3>'
      + '<video autoplay playsinline style="width:100%;height:70vh;object-fit:contain"></video>'
      + '<p style="padding:0 16px">Saved Nanivio voice reference · no microphone capture</p>'
      + '<script src="/bundle.js"></script></body></html>');
    return;
  }
  if (req.headers.cookie !== cookie) { res.writeHead(401).end(); return; }
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return;
  }
  res.setHeader('Content-Type', 'application/json');
  if (!session) { res.writeHead(503).end('{}'); return; }
  if (req.url === '/session') { res.end(JSON.stringify({ sessionToken: session.sessionToken })); return; }
  if (req.url === '/speech') { res.end(JSON.stringify({ pcm })); return; }
  if (req.method === 'POST' && req.url === '/api/assistant/session/probe/anam/v1/engine/session') {
    res.end(JSON.stringify(session.connection)); return;
  }
  res.writeHead(404).end('{}');
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({ commandTimeoutMs: 35000 });
let watchdog: ReturnType<typeof setTimeout> | undefined;
const result: Record<string, unknown> = { sessionStarts: 0, maximumSessionSeconds: 30,
  newTtsRequests: 0, liveLipSyncHumanVerified: false, productionChanged: false };
try {
  const page = await browser.page(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.wait('window.loaded===true');
  session = await provider.create(30);
  result.sessionStarts = 1;
  watchdog = setTimeout(() => { void stop().catch(() => {}); }, 28000);
  const gesture = async (expression: string) => {
    const r = await page.command('Runtime.evaluate', { expression, userGesture: true, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('BROWSER_ACTION_FAILED');
    return r.result.value;
  };
  await gesture('window.begin()');
  await page.wait('window.probe.ready&&window.probe.frames>2', 15000);
  await gesture('window.speak(6)');
  await page.wait('window.probe.audioPeaks>3&&window.probe.firstOutputMs!==null', 10000);
  result.firstSpeechOutputObservedMs = await page.evaluate('window.probe.firstOutputMs');
  await new Promise(resolve => setTimeout(resolve, 500));
  await mkdir('generated-artifacts', { recursive: true });
  await page.screenshot(output + '.jpg');
  await gesture('window.interrupt()');
  result.interruption = await page.evaluate('({locallyMuted:window.probe.locallyMuted,commandMs:window.probe.interruptCommandMs})');
  const peaks = await page.evaluate('window.probe.audioPeaks');
  await new Promise(resolve => setTimeout(resolve, 700));
  await gesture('window.speak(2)');
  await page.wait(`window.probe.audioPeaks>${peaks + 3}&&!document.querySelector('video').muted`, 8000);
  result.resumedSpeech = true;
  await gesture('window.end()');
  result.browser = await page.evaluate('({frames:window.probe.frames,width:window.probe.width,height:window.probe.height,audioTracks:window.probe.audioTracks,videoTracks:window.probe.videoTracks,micRequests:window.probe.micRequests,tracksStopped:window.probe.tracksStopped})');
} catch (error) {
  result.failed = true;
  result.error = error instanceof Error && /^(Anam|Malvi|The|BROWSER_ACTION_FAILED|Expected browser state|Browser command)/.test(error.message)
    ? error.message.slice(0, 180) : 'LIVE_PROBE_FAILED';
} finally {
  if (watchdog) clearTimeout(watchdog);
  try { await stop(); }
  catch { result.stopInitiallyFailed = true; try { await stop(); } catch { result.stopUnconfirmed = true; } }
  result.providerStopConfirmed = session ? stopped : null;
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
await mkdir('generated-artifacts', { recursive: true });
await writeFile(output + '.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed || result.stopUnconfirmed) process.exitCode = 1;
