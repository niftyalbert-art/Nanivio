import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real browser WebSocket and production client, with a local delayed handshake
// and identity acknowledgement. No application account or paid provider used.
const bundle = await build({
  stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    import {realtimeClient} from './src/lib/realtimeClient';
    import {sendMalviBrainStart} from './src/lib/malviBrainStart';
    let current=true;
    window.__acks=0;
    realtimeClient.on('auth:presence_ack',()=>window.__acks++);
    if(new URLSearchParams(location.search).has('cancel'))setTimeout(()=>current=false,100);
    sendMalviBrainStart((type,payload)=>realtimeClient.send(type,payload),
      {sessionId:'isolated-test-session',language:'fr'},()=>current)
      .then(started=>window.__result={started}).catch(()=>window.__result={error:true});
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser',
});
const messages = [];
const sockets = new WebSocketServer({ noServer: true });
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript');res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><script src="/bundle.js"></script>');
  }
});
server.on('upgrade', (req, socket, head) => {
  setTimeout(() => {
    if (socket.destroyed) return;
    sockets.handleUpgrade(req, socket, head, ws => {
      let acknowledged = false;
      ws.on('message', raw => messages.push({ ...JSON.parse(String(raw)), acknowledged }));
      setTimeout(() => {
        if (ws.readyState !== 1) return;
        acknowledged = true;
        ws.send(JSON.stringify({ type: 'auth:presence_ack', payload: { status: 'ONLINE' } }));
      }, 700);
    });
  }, 1500);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
  for (const cancelled of [false, true]) {
    const before = messages.length;
    const page = await browser.page(origin + (cancelled ? '/?cancel=1' : '/'));
    await page.wait('!!window.__result && window.__acks===1', 7000);
    await page.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),600))');
    assert.deepEqual(await page.evaluate('window.__result'), { started: !cancelled });
    const starts = messages.slice(before).filter(message => message.type === 'malvi:brain_start');
    assert.equal(starts.length, cancelled ? 0 : 1, 'No lost, duplicate or obsolete startup');
    assert.ok(starts.every(message => message.acknowledged), 'Wait for identity acknowledgement, not just socket OPEN');
  }
  console.log('PASS: delayed real WebSocket and auth acknowledgement start the brain once; cancelled sessions never start; no provider credits used.');
} finally {
  await browser?.close();
  for (const socket of sockets.clients) socket.terminate();
  sockets.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
