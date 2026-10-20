// Real Agora SDK and Chromium capture with synthetic browser devices only.
// No sign-in, remote participant, provider token, SMS, or billable call is created.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const profile = await mkdtemp(join(tmpdir(), 'nanivio-call-preview-'));
const port = 9235;
const browser = spawn('/repl/tools/bin/chromium', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let target;
  for (let n = 0; n < 100; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  assert.ok(target, 'Chromium did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.once('open', resolve));
  let sequence = 0;
  const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(message.error) : request.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await call('Page.enable');
  await call('Page.navigate', { url: process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000' });
  await delay(1500);
  const result = await call('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const { agoraClient } = await import('/src/lib/agoraClient.ts');
      const report = [];
      for (const type of ['audio', 'video']) {
        const snapshots = [];
        const unsubscribe = agoraClient.subscribeTelemetry(s => snapshots.push(s));
        let stream;
        try {
          stream = await agoraClient.startLocalPreview(type);
          const video = document.createElement('video');
          video.muted = true; video.autoplay = true; video.playsInline = true;
          video.srcObject = stream;
          document.body.append(video);
          if (type === 'video') await video.play();
          await new Promise(resolve => setTimeout(resolve, 500));
          report.push({
            type, audioTracks: stream.getAudioTracks().length,
            videoTracks: stream.getVideoTracks().length,
            liveTracks: stream.getTracks().every(t => t.readyState === 'live'),
            videoWidth: video.videoWidth,
            localReady: snapshots.at(-1).hasLocalMedia,
            remoteReady: snapshots.at(-1).hasRemoteMedia,
            connectionState: snapshots.at(-1).connectionState,
          });
          await agoraClient.setAudioMuted(true);
          await agoraClient.setAudioMuted(false);
          if (type === 'video') {
            await agoraClient.setVideoOff(true);
            await agoraClient.setVideoOff(false);
          }
          stream = agoraClient.getLocalStream();
          report.at(-1).liveAfterDeviceToggles = agoraClient.getLocalStream().getTracks().every(t => t.readyState === 'live');
          video.remove();
        } finally {
          await agoraClient.leaveChannel();
          unsubscribe();
        }
        report.at(-1).allTracksReleased = stream.getTracks().every(t => t.readyState === 'ended');
        report.at(-1).localReadyAfterLeave = agoraClient.getStats().hasLocalMedia;
      }
      return report;
    })()`,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const report = result.result.value;
  for (const entry of report) {
    assert.equal(entry.audioTracks, 1);
    assert.equal(entry.videoTracks, entry.type === 'video' ? 1 : 0);
    assert.equal(entry.liveTracks, true);
    assert.equal(entry.localReady, true);
    assert.equal(entry.remoteReady, false);
    assert.equal(entry.connectionState, 'DISCONNECTED');
    assert.equal(entry.allTracksReleased, true);
    assert.equal(entry.liveAfterDeviceToggles, true);
    assert.equal(entry.localReadyAfterLeave, false);
    if (entry.type === 'video') assert.ok(entry.videoWidth > 0, 'Local video must actually render frames');
  }
  console.log(JSON.stringify({ deviceSource: 'Chromium synthetic microphone/camera', checks: report }, null, 2));
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
}
