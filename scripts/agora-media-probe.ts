// Explicitly billable, isolated two-peer test. No customer sign-in or billing bypass.
// Uses synthetic media, actual RTC publication/subscription, and workspace credentials.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generateAgoraRtcToken } from '../src/server/agoraService';
// @ts-ignore Standalone browser harness.
import { launchBrowser } from './live-call-checks/cdp.mjs';

if (!process.argv.includes('--confirm-billable')) throw new Error('Explicit --confirm-billable required');
const channel = `nv_probe_${randomUUID().replaceAll('-', '')}`;
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'js', contents: `
    import { agoraClient } from './src/lib/agoraClient';
    import { callMediaFailureDetails } from './src/lib/callMediaErrors';
    window.result={ready:true};
    window.begin=async()=>{
      try {
        await agoraClient.joinChannel(${JSON.stringify(channel)},'fixture','Probe','video');
        window.result.joined=true;
      } catch(e) {
        window.result.failure=callMediaFailureDetails(e);
      }
    };
    agoraClient.subscribeRemoteStream(s=>{
      window.result.audio=!!s?.getAudioTracks().length;
      window.result.video=!!s?.getVideoTracks().length;
    });
    window.finish=()=>agoraClient.leaveChannel();
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  plugins: [{ name: 'isolated-media', setup(b) {
    b.onResolve({ filter: /^\//, namespace: 'probe' }, args => ({ path: args.path, namespace: 'file' }));
    b.onResolve({ filter: /authClient$/ }, () => ({ path: 'auth', namespace: 'probe' }));
    b.onResolve({ filter: /^agora-rtc-sdk-ng$/ }, () => ({ path: 'sdk', namespace: 'probe' }));
    b.onLoad({ filter: /.*/, namespace: 'probe' }, args => ({ loader: 'js', contents: args.path === 'auth'
      ? 'export const authClient={getToken:()=>null};'
      : `import SDK from ${JSON.stringify(`${process.cwd()}/node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js`)};
         SDK.setLogLevel(4);SDK.disableLogUpload();
         const contexts=[];
         export default {...SDK,
           createMicrophoneAudioTrack:async()=>{
             const c=new AudioContext();await c.resume();contexts.push(c);
             const d=c.createMediaStreamDestination(),o=c.createOscillator();
             const g=c.createGain();g.gain.value=.02;o.connect(g);g.connect(d);o.start();
             return SDK.createCustomAudioTrack({mediaStreamTrack:d.stream.getAudioTracks()[0]});
           },
           createCameraVideoTrack:async()=>{
             const c=document.createElement('canvas');c.width=320;c.height=240;
             const stream=c.captureStream(5);
             // Draw after capture starts, and keep sending actual frames.
             const timer=setInterval(()=>{
               c.getContext('2d').fillStyle=Date.now()%2?'#345':'#456';
               c.getContext('2d').fillRect(0,0,320,240);
             },200);
             const track=SDK.createCustomVideoTrack({mediaStreamTrack:stream.getVideoTracks()[0]});
             const close=track.close.bind(track);
             track.close=()=>{clearInterval(timer);close();};
             return track;
           }
         };` }));
  } }],
});
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url?.startsWith('/api/agora/token')) {
    // Peers have separate fixture IDs, never customer IDs.
    const uid = new URL(req.headers.referer || 'http://fixture/?peer=a').searchParams.get('peer') || 'a';
    res.setHeader('Content-Type', 'application/json');
    try { res.end(JSON.stringify(generateAgoraRtcToken({ channelName: channel, uid, expireTimeSeconds: 300 }))); }
    catch { res.statusCode=503;res.end(JSON.stringify({error:'Workspace media configuration unavailable'})); }
  } else if (req.url === '/api/agora/join' || req.url === '/api/agora/leave') {
    res.setHeader('Content-Type','application/json');res.end('{"success":true}');
  } else if (req.url === '/probe.js') {
    res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><h1>Isolated media probe</h1><script src="/probe.js"></script>');
  }
});
await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
const port = (server.address() as {port:number}).port;
const browser = await launchBrowser();
let a: any, b: any;
try {
  a=await browser.page(`http://127.0.0.1:${port}/?peer=a`);
  b=await browser.page(`http://127.0.0.1:${port}/?peer=b`);
  await Promise.all([a.wait('window.result?.ready===true'),b.wait('window.result?.ready===true')]);
  await Promise.all([a,b].map(page=>page.command('Runtime.evaluate',{expression:'void window.begin()',userGesture:true})));
  await Promise.all([a,b].map(page=>page.wait('!!(window.result.failure||(window.result.joined&&window.result.audio&&window.result.video))',30000).catch(()=>{})));
  const peers=await Promise.all([a.evaluate('window.result'),b.evaluate('window.result')]);
  const passed=peers.every(p=>p.joined&&p.audio&&p.video&&!p.failure);
  console.log(JSON.stringify({passed,peers,syntheticMedia:true,customerAccountChanged:false}));
  if(!passed)process.exitCode=1;
} finally {
  await Promise.all([a,b].filter(Boolean).map(page=>page.evaluate('window.finish?.()').catch(()=>{})));
  await browser.close();server.closeAllConnections();server.close();
}
