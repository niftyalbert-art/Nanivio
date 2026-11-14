// Isolated component verification: synthetic identities, no real accounts,
// no media SDK, no provider calls, and no production database connections.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { WebSocketServer } from 'ws';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

const output = 'generated-artifacts/realtime-avatar-local-check';
await fs.mkdir(output, { recursive: true });
const fixturePhoto = color => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><!--`
  + 'p'.repeat(497000) + '--></svg>').toString('base64');
const photo = fixturePhoto('teal');
const revision = createHash('sha256').update(photo).digest('hex');
const secondPhoto = fixturePhoto('navy');
const secondRevision = createHash('sha256').update(secondPhoto).digest('hex');
const identity = { userId: 'receiver-id', nvId: '0486222222', name: 'Fixture peer',
  myLanguage: 'en', role: 'PERSONAL', avatarRevision: revision };
let currentIdentity = identity;
const ownIdentity = { ...identity, userId: 'caller-id', nvId: '0486111111', name: 'Fixture viewer' };
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import { realtimeClient as client } from './src/lib/realtimeClient.ts';
    const photo=${JSON.stringify(photo)};
    window.probe={controls:[],photoEvents:0,presenceEvents:0,photoLoaded:false};
    window.fixtureClient=client;
    client.on('presence_update',users=>{
      window.probe.presenceEvents++;
      const peer=users.find(user=>user.userId==='receiver-id');
      if(peer?.avatar)document.querySelector('img').src=peer.avatar;
      else document.querySelector('img').removeAttribute('src');
    });
    client.on('participant_avatar',event=>{
      if(event.userId!=='receiver-id')return;
      window.probe.photoEvents++;
      window.probe.photoLoaded=true;
      window.probe.originalPhotoPreserved=event.avatar===photo;
    });
    for(const type of ['call:incoming','call:accepted','call:ended'])
      client.on(type,()=>window.probe.controls.push({type,beforePhoto:!window.probe.photoLoaded}));
    client.registerUser({id:'caller-id',nvId:'0486111111',name:'Fixture viewer',avatar:photo});
    window.checkOutbound=()=>{
      client.initiateCall('offline-outbound','offline-room','audio',{id:'caller-id',avatar:photo},'receiver-id');
      client.acceptCall('offline-incoming','offline-room',{id:'caller-id',avatar:photo},'receiver-id');
    };
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife',
  plugins: [{ name: 'isolated-auth', setup(builder) {
    builder.onResolve({ filter: /authClient(?:\.ts)?$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const authClient={
        getToken:()=>'offline-avatar-fixture',getStoredUser:()=>({id:'caller-id'}),
        getSessionChange:()=>'',subscribe:()=>()=>{}
      };
    ` }));
  } }],
});

let photoRequests = 0, authorizedRequests = true;
const heldPhotos = [], frameSizes = [], socketClients = new Set();
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Isolated realtime photo check</title><h1>Local component test</h1><img width="64" height="64" alt="Synthetic fixture profile"><script src="/fixture.js"></script>');
  } else if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text);
  } else if (req.url?.startsWith('/api/users/lookup?')) {
    photoRequests++;
    authorizedRequests &&= req.headers.authorization === 'Bearer offline-avatar-fixture';
    if (!authorizedRequests) { res.writeHead(401).end(); return; }
    heldPhotos.push(res);
  } else res.writeHead(404).end();
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', socket => {
  socketClients.add(socket);
  let greeted = false;
  socket.on('message', raw => {
    const message = JSON.parse(String(raw));
    frameSizes.push({ type: message.type, bytes: raw.length });
    if (message.type !== 'auth:presence') return;
    socket.send(JSON.stringify({ type: 'auth:presence_ack', payload: {
      status: 'ONLINE', activeOnlineUsers: [ownIdentity, currentIdentity],
    } }));
    if (greeted) return;
    greeted = true;
    const payload = { callId: 'offline-incoming', channelName: 'offline-room', callType: 'audio',
      caller: { ...identity, id: identity.userId } };
    socket.send(JSON.stringify({ type: 'call:incoming', payload }));
    socket.send(JSON.stringify({ type: 'call:accepted', payload: {
      ...payload, responder: { ...identity, id: identity.userId },
    } }));
    socket.send(JSON.stringify({ type: 'call:ended', payload: { callId: payload.callId } }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await launchBrowser({ commandTimeoutMs: 8000 });
try {
  const page = await browser.page('about:blank');
  await page.command('Network.enable');
  await page.command('Network.setBlockedURLs', { urls: ['https://*', 'wss://*'] });
  await page.command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await page.wait('window.probe?.controls.length===3', 10000);
  assert.equal(photoRequests, 1, 'Own photo should be reused; only the peer needs an HTTP read');
  assert.equal(heldPhotos.length, 1);
  const early = await page.evaluate('({controls:window.probe.controls,photoEvents:window.probe.photoEvents})');
  assert.equal(early.controls.every(event => event.beforePhoto), true);
  assert.equal(early.photoEvents, 0, 'Call control must arrive while the photo response is still held');
  heldPhotos.shift().writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({ success: true, user: { id: identity.userId, avatar: photo } }));
  await page.wait('window.probe.photoLoaded && document.querySelector("img").naturalWidth===64', 10000);
  assert.equal(await page.evaluate('window.probe.originalPhotoPreserved'), true);
  assert.equal(await page.evaluate('window.probe.controls.length'), 3, 'Hydration must not replay call events');
  const beforeRefresh = await page.evaluate('window.probe.presenceEvents');
  for (const socket of socketClients) socket.send(JSON.stringify({ type: 'presence:update',
    payload: { activeOnlineUsers: [ownIdentity, identity] } }));
  await page.wait(`window.probe.presenceEvents>${beforeRefresh}`);
  assert.equal(photoRequests, 1, 'An unchanged reference must not refetch the photo');
  await page.evaluate('window.checkOutbound()');
  await page.wait('window.probe.controls.length===3');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(frameSizes.some(frame => frame.type === 'call:initiate'));
  assert.ok(frameSizes.some(frame => frame.type === 'call:accept'));
  assert.ok(frameSizes.every(frame => frame.bytes < 2048));
  await page.screenshot(`${output}/component.png`);

  currentIdentity = { ...identity, avatarRevision: secondRevision };
  for (const socket of socketClients) socket.send(JSON.stringify({ type: 'presence:update',
    payload: { activeOnlineUsers: [ownIdentity, currentIdentity] } }));
  const deadline = Date.now() + 5000;
  while (photoRequests < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(photoRequests, 2);
  await page.evaluate('window.fixtureClient.disconnect()');
  for (const res of heldPhotos.splice(0)) res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({ success: true, user: { id: identity.userId, avatar: secondPhoto } }));
  await page.wait('!document.querySelector("img").hasAttribute("src")');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await page.evaluate('window.probe.photoEvents'), 1, 'Late old-account responses must be ignored');
  console.log(JSON.stringify({ passed: true, isolatedComponentOnly: true, realAccountsUsed: false,
    providerCalls: 0, photoDecodedAtOriginalSize: true, originalPhotoPreserved: true,
    controlsDeliveredBeforePhoto: true, callEventsNotReplayed: true, lateResponseIgnoredAfterDisconnect: true,
    authenticatedDirectoryReads: authorizedRequests, initialPhotoReads: 1,
    outboundControlFrames: frameSizes.map(frame => ({ type: frame.type, bytes: frame.bytes })) }));
} finally {
  for (const res of heldPhotos) res.destroy();
  for (const socket of socketClients) socket.terminate();
  await browser.close();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
