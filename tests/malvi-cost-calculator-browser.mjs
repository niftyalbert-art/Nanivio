// Isolated real-component/HTTP tests. No production authentication bypass or paid provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';
import { createMalviCostRouter } from '../src/server/malviCostCalculator.ts';
import { requireBillingAdmin } from '../src/server/billingAccess.ts';

let document = null;
let mode = 'normal';
let role = 'FINANCE_ADMIN';
let posts = 0;
const provider = async () => {
  if (mode === 'storage-down') throw Error('fixture storage outage');
  return {
    getBillingCostDocument: async () => document,
    compareAndSetBillingCostDocument: async (version, next) => {
      posts++;
      if (mode === 'conflict') return false;
      if ((document ? JSON.parse(document).snapshot.version : 0) !== version) return false;
      document = next;
      return true;
    },
  };
};
const bundle = await build({
  stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {AdminMalviCostCalculator} from './src/components/admin/AdminMalviCostCalculator.tsx';
    window.fixtureErrors=[];
    window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    createRoot(document.getElementById('root')).render(<AdminMalviCostCalculator/>);
  `, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  plugins: [{ name: 'test-auth-only', setup(b) {
    b.onResolve({ filter: /\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "export const authClient={getToken:()=> 'fixture-only'};" }));
  } }],
});
const cssFile = (await fs.readdir('dist/assets')).find(name => name.endsWith('.css'));
const css = await fs.readFile(`dist/assets/${cssFile}`, 'utf8');
const app = express();
app.use(express.json());
app.get('/fixture.js', (_req, res) => res.type('js').send(bundle.outputFiles[0].text));
app.get('/fixture.css', (_req, res) => res.type('css').send(css));
app.use('/api/admin/billing', (req, res, next) => {
  if (req.header('authorization') !== 'Bearer fixture-only') return res.sendStatus(401);
  req.authUser = { id: 'fixture-finance', role: 'ADMIN', accountStatus: 'ACTIVE', adminSubRole: role };
  next();
}, requireBillingAdmin);
app.use('/api/admin/billing/malvi-costs', (req, res, next) => {
  if (mode === 'load-error' && req.method === 'GET') return res.status(503).json({ success: false, error: 'Fixture load failure' });
  next();
}, createMalviCostRouter(provider, async () => {
  if (mode === 'fx-down') throw Error('fixture FX outage');
  return {
    rate: 11.67155, asOf: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    source: 'Isolated test reference rate', attributionUrl: 'https://www.exchangerate-api.com',
  };
}));
app.get('/', (_req, res) => res.send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body style="margin:0;padding:16px;background:#080e18;font-family:system-ui"><div id="root"></div><script src="/fixture.js"></script></body></html>'));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}/`);
  const text = () => page.evaluate('document.body.innerText');
  const set = async (selector, value) => {
    await page.evaluate(`(()=>{
      const el=document.querySelector(${JSON.stringify(selector)});
      const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
    })()`);
  };
  const click = async label => {
    await page.evaluate(`(()=>{
      const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));
      if(!b||b.disabled)throw Error('Button unavailable');b.click();return true;
    })()`);
  };
  const reload = async () => {
    await page.command('Page.reload');
    await page.wait(`!!document.querySelector('#malvi-customers')`);
  };
  await page.wait(`!!document.querySelector('#malvi-customers')`);
  assert.match(await text(), /Planning only/);
  assert.match(await text(), /GH₵/);
  assert.match(await text(), /USD 6\.08/);
  // Public defaults can be explicitly saved without forcing a cosmetic edit first.
  await set('#malvi-change-reason', 'Accept reviewed public rates');
  await click('Save snapshot');
  await page.wait(`document.body.innerText.includes('Saved. The new snapshot')`);
  assert.equal(JSON.parse(document).snapshot.version, 1);
  await set('#malvi-customers', 200);
  await page.wait(`document.body.innerText.includes('200 modeled customers')`);
  assert.match(await text(), /USD 5\.17/);
  await set('#malvi-change-reason', 'Model two hundred paid customers');
  await click('Save snapshot');
  await page.wait(`document.body.innerText.includes('Snapshot v2')`);
  assert.equal(JSON.parse(document).snapshot.scenario.customers, 200);
  await reload();
  assert.equal(await page.evaluate(`document.querySelector('#malvi-customers').value`), '200');
  // Optimistic conflicts preserve local edits and do not claim success.
  mode = 'conflict';
  await set('#malvi-renderMonthly', 26);
  await set('#malvi-change-reason', 'Test concurrency conflict protection');
  await click('Save snapshot');
  await page.wait(`document.body.innerText.includes('Not saved:')`);
  assert.equal(await page.evaluate(`document.querySelector('#malvi-renderMonthly').value`), '26');
  assert.equal(JSON.parse(document).snapshot.version, 2);
  mode = 'normal';
  await page.evaluate(`window.confirm=()=>true;true`);
  await click('Reload saved');
  await page.wait(`document.querySelector('#malvi-renderMonthly')?.value==='25'`);
  // Rejected numerical combinations produce actionable validation text.
  await set('#malvi-marginPercent', 99);
  await page.wait(`document.body.innerText.includes('must be less than 100%')`);
  assert.equal(await page.evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  await set('#malvi-marginPercent', 60);
  await page.command('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await fs.mkdir('generated-artifacts', { recursive: true });
  await page.screenshot('generated-artifacts/malvi-cost-calculator-mobile.png');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await page.screenshot('generated-artifacts/malvi-cost-calculator-desktop.png');
  role = 'AUDITOR';
  await reload();
  assert.match(await text(), /Saving requires finance or super-admin permission/);
  assert.equal(await page.evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  role = 'FINANCE_ADMIN';
  mode = 'storage-down';
  await reload();
  assert.match(await text(), /shared storage unavailable/);
  assert.equal(await page.evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  mode = 'fx-down';
  await reload();
  assert.match(await text(), /GHS estimate unavailable/);
  assert.equal(await page.evaluate(`!!document.querySelector('a[href="https://www.exchangerate-api.com"]')`), false);
  mode = 'load-error';
  await page.command('Page.reload');
  await page.wait(`document.body.innerText.includes('Saved settings could not be loaded')`);
  await click('Use public defaults locally');
  await page.wait(`!!document.querySelector('#malvi-customers')`);
  assert.equal(await page.evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  mode = 'normal';
  await click('Retry loading');
  await page.wait(`!!document.querySelector('#malvi-customers')`);
  assert.equal(await page.evaluate('window.fixtureErrors.length'), 0);
  console.log(JSON.stringify({ passed: true, checks: [
    'real component and authenticated HTTP hooks', 'save unchanged public defaults',
    'live estimate recomputation', 'reload saved settings', 'conflict preserves edits',
    'numeric validation', '360px/1440px no horizontal overflow',
    'read-only role', 'storage failure', 'FX failure without stale rate', 'load failure and retry',
  ], requestsSavedOrConflicted: posts, paidProviderCalls: 0 }));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
