// Real Chromium smoke test. Does not authenticate, create accounts, or send email/SMS.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const profile = await mkdtemp(join(tmpdir(), 'nanivio-signup-check-'));
const output = 'generated-artifacts/signup-check';
await mkdir(output, { recursive: true });
const port = 9234;
const browser = spawn('/repl/tools/bin/chromium', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function rgb(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `Expected a resolved RGB colour: ${value}`);
  return channels;
}
function contrast(a, b) {
  const luminance = value => rgb(value).map(channel => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
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
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
  });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression) {
    for (let n = 0; n < 150; n++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}`);
  }
  async function screenshot(name) {
    const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    await writeFile(`${output}/${name}.jpg`, Buffer.from(data, 'base64'));
  }
  await call('Page.enable');
  await call('Runtime.enable');
  const base = process.env.NANIVIO_TEST_URL || 'http://127.0.0.1:5000';
  const report = [];
  for (const [name, width, height] of [['desktop', 1365, 950], ['mobile', 402, 874]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    await call('Page.navigate', { url: base });
    await wait("document.querySelector('#tab-auth-signin')");
    await evaluate('document.fonts.ready.then(() => true)');
    const theme = await evaluate(`(() => {
      const surface = document.querySelector('.nanivio-auth');
      const submit = document.querySelector('#btn-submit-signin');
      const input = surface.querySelector('input:not([type=checkbox]):not([type=radio])');
      return {
        surface: getComputedStyle(surface).backgroundColor,
        buttonBackground: getComputedStyle(submit).backgroundColor,
        buttonText: getComputedStyle(submit).color,
        inputBackground: getComputedStyle(input).backgroundColor,
        inputText: getComputedStyle(input).color,
        visibleAmbientBlobs: [...surface.querySelectorAll('[class*="blur-3xl"]')].filter(el =>
          getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0).length,
      };
    })()`);
    assert.ok(Math.max(...rgb(theme.surface)) < 100, `${name}: auth surface must use the dark theme`);
    assert.ok(Math.max(...rgb(theme.inputBackground)) < 115, `${name}: inputs must use a dark surface`);
    const [red, green, blue] = rgb(theme.buttonBackground);
    assert.ok(red >= 180 && green >= 100 && blue < 120 && red > green, `${name}: primary action should be gold/amber`);
    assert.ok(contrast(theme.buttonBackground, theme.buttonText) >= 4.5, `${name}: primary button contrast`);
    assert.ok(contrast(theme.inputBackground, theme.inputText) >= 4.5, `${name}: input text contrast`);
    assert.equal(theme.visibleAmbientBlobs, 0, `${name}: no blurred ambient blobs`);
    await screenshot(`${name}-signin`);
    await evaluate("document.querySelector('#tab-auth-personal').click()");
    await wait("document.querySelector('#input-personal-phone')");
    await delay(400);
    const state = await evaluate(`(() => {
      const input = document.querySelector('#input-personal-phone');
      const card = input.closest('form');
      return {
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        cardTop: card.getBoundingClientRect().top,
        hasEmailVerification: document.body.innerText.includes('Send email code'),
        hasSmsSend: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Send verification code'),
        locationFields: document.querySelectorAll('[id*="personal-city"],[id*="constituency"],[id*="personal-district"]').length,
        countryPrompt: document.querySelector('#personal-country-selector button').innerText.trim(),
        inputFontSize: parseFloat(getComputedStyle(input).fontSize),
        workspaceError: document.body.innerText.includes('temporary display condition'),
        playingVideo: [...document.querySelectorAll('video')].some(v => !v.paused),
      };
    })()`);
    assert.ok(state.scrollWidth <= state.width + 1, `${name}: horizontal overflow`);
    assert.ok(state.cardTop < height, `${name}: signup begins below viewport`);
    assert.equal(state.hasEmailVerification, true);
    assert.equal(state.hasSmsSend, false);
    assert.equal(state.locationFields, 0);
    assert.equal(state.countryPrompt, 'Select country');
    assert.ok(state.inputFontSize >= 16);
    assert.equal(state.workspaceError, false);
    assert.equal(state.playingVideo, false);
    await screenshot(`${name}-signup`);
    await evaluate("document.querySelector('#personal-country-selector button').click()");
    await wait("[...document.querySelectorAll('#personal-country-selector button')].some(b => b.textContent.includes('United Kingdom'))");
    await evaluate("[...document.querySelectorAll('#personal-country-selector button')].find(b => b.textContent.includes('United Kingdom')).click()");
    assert.ok((await evaluate("document.querySelector('#personal-country-selector button').innerText")).includes('+44'));
    report.push({ viewport: name, ...state, internationalCountrySelection: true, theme });
  }
  assert.deepEqual(exceptions, [], 'Uncaught browser exceptions');
  console.log(JSON.stringify({ checks: report, uncaughtExceptions: exceptions, output }, null, 2));
} finally {
  socket?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => browser.once('exit', resolve));
  await rm(profile, { recursive: true, force: true });
}
