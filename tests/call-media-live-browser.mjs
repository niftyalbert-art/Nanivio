// Actual HTTP handlers, signaling, browser Agora client and (with --provider)
// real Agora media. Only identity and customer usage storage are isolated.
// A provider run permits one audio + one video call, four initial RTC tokens,
// and no application-level retry. Never print tokens, keys or SDK raw errors.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { WebSocket } from 'ws';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const paid = process.argv.includes('--provider');
const httpBrowser = process.argv.includes('--http-browser');
const videoOnly = process.argv.includes('--video-only');
const modes = { database: null, allowance: false };
const source = await readFile('server.ts', 'utf8');
const begin = source.indexOf('app.post("/api/agora/token",');
const end = source.indexOf('app.get("/api/agora/channels",', begin);
assert.ok(begin > 0 && end > begin, 'Production call routes could not be located');
const backend = await build({
  stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    import express from 'express';
    import {setupRealtimeServer,canJoinAgoraCall,communicationTokenSeconds} from './src/server/realtimeServer.ts';
    import * as auth from './src/server/persistentAuth.ts';
    import {generateAgoraRtcToken as signToken,registerAgoraParticipant,removeAgoraParticipant} from './src/server/agoraService.ts';
    import {classifyCallTokenFailure} from './src/server/callTokenFailure.ts';
    export const state={live:false,issued:0,limit:4,invalid:false,registrations:[]};
    export const app=express();app.use(express.json());
    app.use((req,res,next)=>{
      if(req.path==='/api/agora/join'){
        const original=res.json.bind(res);
        res.json=body=>{state.registrations.push({status:res.statusCode,success:body?.success===true});return original(body);};
      }
      next();
    });
    const authenticatedUserId=req=>req.authUser.id;
    async function requireAuthenticatedUser(req,res,next){
      const user=await auth.userFromToken(String(req.headers.authorization||'').replace(/^Bearer /,''));
      if(!user)return res.status(401).json({error:'Sign in required.'});
      req.authUser=user;next();
    }
    function generateAgoraRtcToken(options){
      if(state.live && ++state.issued>state.limit)throw new Error('Provider test token budget reached.');
      return signToken({...options,...(state.live?{}:{appId:state.invalid?'invalid':'a'.repeat(32),appCertificate:'b'.repeat(32)})});
    }
    ${source.slice(begin, end)}
    export {setupRealtimeServer,canJoinAgoraCall};
  ` },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'isolated-customer-data', setup(b) {
    b.onResolve({ filter: /persistentAuth\.ts$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({ filter: /supabaseServer\.ts$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'db'
      ? 'export function getServerSupabase(){return {rpc:(_name,args)=>fixtureRpc(args)}}'
      : `export function adminFromToken(){return null}
         export function persistentAuthConfigured(){return true}
         export async function userFromToken(token){return ['A','B','C'].includes(token)?
           {id:token+'-id',nvId:token==='A'?'0486111111':token==='B'?'0486222222':'0486333333',
            firstName:token,role:'PERSONAL',accountStatus:'ACTIVE',preferredLanguage:'en'}:null}` }));
  } }],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'fixtureRpc', backend.outputFiles[0].text)(
  createRequire(import.meta.url), mod, mod.exports, async () => {
    if (modes.database) return { data: null, error: { code: modes.database, message: 'Private database detail' } };
    if (modes.allowance) return { data: { success: false, error: 'Private allowance detail' }, error: null };
    return { data: { success: true, policy: { callTrialDays: 30, warningSeconds: 60 },
      trialStartedAt: null, sharedCallMinutes: 0, liveTrialSecondsRemaining: 180 }, error: null };
  });
const { app, state, setupRealtimeServer } = mod.exports;
const server = createServer(app);
const wss = setupRealtimeServer(server);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const sockets = [];
let browser;

async function peer(user) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
  sockets.push(socket);
  const messages = [];
  socket.on('message', raw => messages.push(JSON.parse(String(raw))));
  await once(socket, 'open');
  const send = (type, payload) => socket.send(JSON.stringify({ type, payload }));
  async function wait(type, callId) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const i = messages.findIndex(m => m.type === type && (!callId || m.payload?.callId === callId));
      if (i >= 0) return messages.splice(i, 1)[0].payload;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(`Signaling event missing: ${type}`);
  }
  send('auth:presence', { token: user }); await wait('auth:presence_ack');
  return { send, wait };
}
async function token(user, channelName, extra = {}) {
  const response = await fetch(origin + '/api/agora/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) },
    body: JSON.stringify({ channelName, ...extra }),
  });
  return { status: response.status, body: await response.json() };
}
const browserBundle = await build({
  stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    import AgoraRTC from 'agora-rtc-sdk-ng';
    import {agoraClient} from './src/lib/agoraClient';
    import {callMediaErrorMessage,callMediaFailureDetails} from './src/lib/callMediaErrors';
    AgoraRTC.setLogLevel(4);AgoraRTC.disableLogUpload();
    const user=new URLSearchParams(location.search).get('user');
    const video=document.querySelector('video');
    let context,analyser,analyserSource,zero,interval;
    window.result={ready:true,joined:false,peak:0,failed:null,registrationResponses:[]};
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const response=await originalFetch(input,init);
      if(String(input).endsWith('/api/agora/join')){
        const detail={status:response.status,contentType:response.headers.get('content-type')};
        window.result.registrationResponses.push(detail);
        void response.clone().text().then(text=>{
          detail.bytes=text.length;
          try{const body=JSON.parse(text);detail.validJson=true;detail.success=body.success===true;}
          catch{detail.validJson=false;}
        }).catch(error=>{detail.readFailure=['AbortError','TimeoutError','SyntaxError'].includes(error?.name)?error.name:'OTHER';});
      }
      return response;
    };
    agoraClient.subscribeRemoteStream(stream=>{
      video.srcObject=stream;if(stream)video.play().catch(()=>{});
      const audio=stream?.getAudioTracks();
      if(audio?.length&&context&&!analyser){
        analyser=context.createAnalyser();analyserSource=context.createMediaStreamSource(new MediaStream(audio));
        zero=context.createGain();zero.gain.value=0;
        analyserSource.connect(analyser);analyser.connect(zero);zero.connect(context.destination);
        const samples=new Float32Array(analyser.fftSize);
        interval=setInterval(()=>{analyser.getFloatTimeDomainData(samples);
          for(const value of samples)window.result.peak=Math.max(window.result.peak,Math.abs(value));},50);
      }
    });
    window.begin=async(channel,type)=>{
      context=new AudioContext();await context.resume();
      try{await agoraClient.joinChannel(channel,user+'-id',user,type);window.result.joined=true;}
      catch(error){window.result.failed={...callMediaFailureDetails(error),message:callMediaErrorMessage(error,type)};}
    };
    window.check=()=>{
      const stats=agoraClient.getStats(),remote=agoraClient.getRemoteStream();
      return {...window.result,connection:stats.connectionState,audioTracks:remote?.getAudioTracks().length||0,
        videoTracks:remote?.getVideoTracks().length||0,videoWidth:video.videoWidth,
        frames:video.getVideoPlaybackQuality?.().totalVideoFrames||0,
        receivedKbps:stats.downlinkBitrateKbps};
    };
    window.finish=async()=>{
      clearInterval(interval);analyserSource?.disconnect();zero?.disconnect();
      await agoraClient.leaveChannel();await context?.close();
      return {connection:agoraClient.getStats().connectionState,local:!!agoraClient.getLocalStream(),remote:!!agoraClient.getRemoteStream()};
    };
    window.registrationCheck=async(channel)=>{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
      const responses=[];
      try{
        for(let i=0;i<10;i++){
          const start=performance.now();
          const response=await fetch('/api/agora/join',{method:'POST',
            headers:{'Content-Type':'application/json',Authorization:'Bearer '+user},
            body:JSON.stringify({channelName:channel,callType:'video'}),signal:AbortSignal.timeout(15000)});
          const text=await response.text();let body;try{body=JSON.parse(text);}catch{}
          responses.push({status:response.status,json:!!body,success:body?.success===true,
            bytes:text.length,elapsedMs:Math.round(performance.now()-start)});
        }
      }finally{stream.getTracks().forEach(track=>track.stop());}
      return responses;
    };
  ` },
  bundle: true, write: false, format: 'iife',
  plugins: [{ name: 'isolated-sign-in', setup(b) {
    b.onResolve({ filter: /authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: "export const authClient={getToken:()=>new URLSearchParams(location.search).get('user')};",
    }));
  } }],
});
app.get('/client.js', (_req, res) => res.type('js').send(browserBundle.outputFiles[0].text));
app.get('/', (_req, res) => res.type('html').send(
  '<!doctype html><h1>Isolated calling test — synthetic camera and microphone</h1><video autoplay muted playsinline></video><script src="/client.js"></script>'));

const report = { http: {}, provider: [], customerDataTouched: false, deployed: false };
try {
  const a = await peer('A'), b = await peer('B');
  async function connect(type) {
    const callId = `isolated-${randomUUID()}`;
    a.send('call:initiate', { callId, callType: type, recipientId: 'B-id' });
    await b.wait('call:incoming', callId);
    b.send('call:accept', { callId });
    const accepted = await a.wait('call:accepted', callId);
    await b.wait('call:connected', callId);
    return { callId, channel: accepted.channelName };
  }
  async function hangup(callId) {
    a.send('call:end', { callId });
    await Promise.all([a.wait('call:ended', callId), b.wait('call:ended', callId)]);
  }
  const call = await connect('audio');
  assert.equal((await token('', call.channel)).status, 401);
  assert.equal((await token('C', call.channel)).status, 403);
  assert.equal((await token('A', 'uninvited-room')).status, 403);
  for (const user of ['A', 'B']) {
    const response = await token(user, call.channel, { uid: 'C-id', role: 'subscriber', expireTimeSeconds: 86400 });
    assert.equal(response.status, 200); assert.ok(response.body.token);
    assert.equal(response.body.communicationExpiresIn, 60);
  }
  for (const [fault, code] of [['PGRST202', 'CALL_USAGE_SETUP_REQUIRED'], ['57014', 'CALL_USAGE_UNAVAILABLE']]) {
    modes.database = fault;
    const response = await token('A', call.channel);
    assert.equal(response.status, 503); assert.equal(response.body.code, code);
    assert.doesNotMatch(JSON.stringify(response.body), /Private/);
  }
  modes.database = null; modes.allowance = true;
  assert.equal((await token('A', call.channel)).status, 402);
  modes.allowance = false; state.invalid = true;
  assert.equal((await token('A', call.channel)).body.code, 'CALL_CONFIGURATION_INVALID');
  state.invalid = false;
  await hangup(call.callId);
  assert.equal((await token('A', call.channel)).status, 403);
  report.http = { passed: true, authentication: true, participantAuthorization: true,
    signedTokensForBothUsers: true, allowance402: true, schema503: true, temporary503: true, revokedAfterHangup: true };

  if (httpBrowser) {
    browser = await launchBrowser({ fakeMedia: true });
    const active = await connect('video');
    const pages = await Promise.all(['A','B'].map(user => browser.page(origin + '/?user=' + user)));
    try {
      await Promise.all(pages.map(page => page.wait('window.result?.ready===true')));
      const responses = await Promise.all(pages.map(page => page.evaluate(
        `window.registrationCheck(${JSON.stringify(active.channel)})`)));
      assert.ok(responses.flat().every(response => response.status === 200 && response.json && response.success));
      report.http.browserRegistration = { passed: true, responses };
    } finally { await hangup(active.callId); }
  }
  if (paid) {
    state.live = true; state.limit = videoOnly ? 2 : 4;
    browser = await launchBrowser({ fakeMedia: true });
    for (const type of videoOnly ? ['video'] : ['audio', 'video']) {
      state.registrations = [];
      let active;
      const pages = [];
      const outcome = { type, passed: false, source: 'live Agora; synthetic devices; isolated customer database' };
      try {
        active = await connect(type);
        for (const user of ['A', 'B']) pages.push(await browser.page(origin + '/?user=' + user));
        await Promise.all(pages.map(page => page.wait('window.result?.ready===true')));
        await Promise.all(pages.map(page => page.command('Runtime.evaluate', {
          expression: `void window.begin(${JSON.stringify(active.channel)},${JSON.stringify(type)})`, userGesture: true,
        })));
        const deadline = Date.now() + 25000;
        let checks;
        do {
          checks = await Promise.all(pages.map(page => page.evaluate('window.check()')));
          if (checks.some(check => check.failed)) break;
          if (checks.every(check => check.joined && check.audioTracks > 0 && check.peak > 0.00001
            && (type === 'audio' || (check.videoTracks > 0 && check.frames > 0 && check.videoWidth > 0)))) break;
          await new Promise(resolve => setTimeout(resolve, 250));
        } while (Date.now() < deadline);
        outcome.peers = checks;
        outcome.serverRegistrations = [...state.registrations];
        outcome.passed = checks.every(check => !check.failed && check.joined && check.connection === 'CONNECTED'
          && check.audioTracks > 0 && check.peak > 0.00001
          && (type === 'audio' || (check.videoTracks > 0 && check.frames > 0 && check.videoWidth > 0)));
      } catch {
        outcome.failure = 'Isolated live browser test could not complete within its budget.';
      } finally {
        if (active) { await hangup(active.callId); outcome.hangupReachedBothUsers = true; }
        for (const page of pages) {
          await page.command('Runtime.evaluate', { expression: 'void window.finish()' }).catch(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        outcome.cleanup = await Promise.all(pages.map(page => page.evaluate('window.check().connection').catch(() => 'browser closed')));
      }
      report.provider.push(outcome);
    }
  }
  report.passed = report.http.passed && (!paid || report.provider.every(result => result.passed));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  for (const socket of sockets) socket.terminate();
  await new Promise(resolve => wss.close(resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
