import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

export async function launchBrowser({ fakeMedia = false, audioFile, commandTimeoutMs = 60000 } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nanivio-live-browser-'));
  const child = spawn('/repl/tools/bin/chromium', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--no-first-run', `--user-data-dir=${directory}`,
    ...(fakeMedia ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
    ...(fakeMedia && audioFile ? [`--use-file-for-fake-audio-capture=${path.resolve(audioFile)}`] : []),
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Browser could not start')); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Browser exited during startup')); });
    child.stderr.on('data', data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  }).catch(async error => {
    child.kill();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let nextId = 0;
  let closed = false;
  let closing;
  const pending = new Map();
  const observers = new Map();
  const rejectPending = () => {
    closed = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(new Error('Browser connection closed'));
    }
    pending.clear();
  };
  socket.on('close', rejectPending);
  socket.on('error', rejectPending);
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if(message.method){
      for(const fn of observers.get(`${message.sessionId}:${message.method}`)||[]){
        try{fn(message.params);}catch{}
      }
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`Browser command failed: ${entry.method}`));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}, sessionId, timeoutMs=commandTimeoutMs) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error('Browser connection closed')); return; }
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timeout, method });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return {
    async page(origin) {
      const { browserContextId } = await send('Target.createBrowserContext');
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const command = (method, params, options={}) => send(method, params, sessionId, options.timeoutMs);
      const evaluate = async expression => {
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
          const exceptionClass=result.exceptionDetails.exception?.className;
          throw new Error('Browser evaluation failed',{cause:{
            exceptionClass:['Error','TypeError','ReferenceError','SyntaxError','RangeError','DOMException']
              .includes(exceptionClass)?exceptionClass:'UnclassifiedError',
          }});
        }
        return result.result.value;
      };
      await command('Page.enable');
      await command('Runtime.enable');
      await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await command('Page.navigate', { url: origin });
      return {
        evaluate, command,
        on(method, fn) {
          const key=`${sessionId}:${method}`, listeners=observers.get(key)||new Set();
          listeners.add(fn);observers.set(key,listeners);
          return ()=>listeners.delete(fn);
        },
        async wait(expression, milliseconds = 25000) {
          const end = Date.now() + milliseconds;
          while (Date.now() < end) {
            if (await evaluate(expression).catch(() => false)) return;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          throw new Error('Expected browser state was not reached');
        },
        async screenshot(file) {
          const result = await command('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(file, Buffer.from(result.data, 'base64'), { mode: 0o600 });
        },
      };
    },
    async close() {
      if (!closing) closing = (async () => {
        // The hard call budget must not wait another full command timeout
        // for a stalled renderer. Reject observers immediately after shutdown.
        try { await send('Browser.close', {}, undefined, 1000); } catch {}
        rejectPending();
        socket.terminate();
        child.kill('SIGKILL');
        observers.clear();
        // Chromium may still finish profile writes after close/kill is signalled.
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      })();
      return closing;
    },
  };
}
