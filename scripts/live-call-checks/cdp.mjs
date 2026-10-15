import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

export async function launchBrowser() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nanivio-live-browser-'));
  const child = spawn('/repl/tools/bin/chromium', [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--no-first-run', `--user-data-dir=${directory}`,
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
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let nextId = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`Browser command failed: ${entry.method}`));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timeout, method });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return {
    async page(origin) {
      const { browserContextId } = await send('Target.createBrowserContext');
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const command = (method, params) => send(method, params, sessionId);
      const evaluate = async expression => {
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error('Browser evaluation failed');
        return result.result.value;
      };
      await command('Page.enable');
      await command('Runtime.enable');
      await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await command('Page.navigate', { url: origin });
      return {
        evaluate, command,
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
      await send('Browser.close').catch(() => {});
      socket.close();
      child.kill();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
