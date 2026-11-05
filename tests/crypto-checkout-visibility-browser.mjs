import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Render the real checkout and crypto dialog, replacing only authentication
// context and HTTP responses. No real invoice or charge may be submitted.
const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {PaystackTopUpModal} from './src/components/billing/PaystackTopUpModal';
    import {PaymentMethodButtons} from './src/components/billing/PaymentMethodButtons';
    window.owner={id:'fixture-a',email:'fixture@example.invalid'};
    window.config={enabled:true,eligible:true,supportedPurposes:['SUBSCRIPTION','MALVI_SUBSCRIPTION','COMMUNICATION_TOPUP','COMMUNICATION_MINUTES']};
    window.configFailure=false;window.calls=[];
    window.request=async(url,init={})=>{
      window.calls.push({url,method:init.method||'GET'});
      if(init.method==='POST')throw Error('Payment writes are forbidden in this test');
      if(url.endsWith('/config')){
        if(window.configFailure)throw Error('Fixture network failure');
        return window.config;
      }
      return {success:true,invoices:[]};
    };
    const root=createRoot(document.getElementById('root'));
    window.renderCheckout=(purpose='MALVI_SUBSCRIPTION',method='USDT')=>root.render(
      <PaystackTopUpModal key={purpose+method+window.caseNumber} isOpen onClose={()=>window.showMethods(purpose)} onSuccess={()=>{}}
        purpose={purpose} planTier={purpose.includes('SUBSCRIPTION')?'malvi_basic':undefined}
        packageId={purpose==='COMMUNICATION_MINUTES'?'pack-150':undefined}
        initialPaymentMethod={method} billingCycle="MONTHLY" />);
    window.showMethods=(purpose='MALVI_SUBSCRIPTION')=>root.render(<PaymentMethodButtons
      creditEnabled={purpose!=='COMMUNICATION_TOPUP'}
      onSelect={method=>window.renderCheckout(purpose,method)} />);
    window.caseNumber=0;window.showMethods();
  ` },
  plugins: [{
    name: 'checkout-fixtures',
    setup(api) {
      api.onResolve({ filter: /(?:^|\/)context\/NanivioContext$/ }, () => ({ path: 'context', namespace: 'fixture' }));
      api.onResolve({ filter: /(?:^|\/)billingClient$/ }, () => ({ path: 'billing', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        loader: 'js',
        contents: path === 'context'
          ? 'export const useNanivio=()=>({authUser:window.owner,refreshBilling:async()=>{}});'
          : `export const protectedBillingRequest=(...args)=>window.request(...args);
             export const billingClient={getMalviPlans:async()=>[{
               tier:'malvi_basic',name:'Malvi Basic',isActive:true,catalogVersion:0,features:['Fixture voice and video allowance'],
               priceMonthlyGHS:50,priceAnnualGHS:500,priceMonthlyUSD:4.99,
               priceAnnualUSD:49,voiceInteractionMinutesLimit:30,videoInteractionMinutesLimit:30,
               currencyConversion:{rate:10,expiresAt:new Date(Date.now()+86400000).toISOString()}
             }]};`,
      }));
    },
  }],
  bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
});
const css = (await Promise.all((await readdir('dist/assets'))
  .filter(name => name.endsWith('.css'))
  .map(name => readFile(`dist/assets/${name}`, 'utf8')))).join('\n');
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript');res.end(bundle.outputFiles[0].text);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><div id="root"></div><script>window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message));</script><script src="/bundle.js"></script></body></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
let currentPage;
try {
  for (const width of [390, 1440]) {
    const page = await browser.page(origin);
    currentPage = page;
    await page.command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    await page.wait(`!![...document.querySelectorAll('button')].find(e=>e.innerText==='USDT'&&!e.disabled)`);
    let text = await page.evaluate('document.body.innerText');
    assert.match(text,/Pay with:/);assert.match(text,/Paystack/);assert.match(text,/Nanivio credit · P2P/);
    assert.doesNotMatch(text,/Paystack or USDT/);
    await page.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='USDT').click();true`);
    await page.wait(`document.body.innerText.includes('Create USDT invoice')`);
    assert.doesNotMatch(await page.evaluate('document.body.innerText'),/Live cryptographic verification via Paystack/);
    // Legacy enabled-only config must not make a public checkout disappear.
    await page.evaluate(`window.config={enabled:true};window.caseNumber++;window.renderCheckout();true`);
    await page.wait(`document.body.innerText.includes('Create USDT invoice')`);
    // Explicit ineligibility wins, even if the service itself is enabled.
    await page.evaluate(`window.config={enabled:true,eligible:false,reason:'Fixture account not eligible'};window.caseNumber++;window.renderCheckout();true`);
    await page.wait(`document.body.innerText.includes('Fixture account not eligible')`);
    assert.equal(await page.evaluate(`!![...document.querySelectorAll('button')].find(e=>e.innerText==='Create USDT invoice')`), false);
    // Network failures stay visible with a working retry instead of a silent hide.
    await page.evaluate(`window.configFailure=true;window.caseNumber++;window.renderCheckout();true`);
    await page.wait(`document.body.innerText.includes('Fixture network failure')`);
    await page.evaluate(`window.configFailure=false;window.config={enabled:true,eligible:true};[...document.querySelectorAll('button')].find(e=>e.innerText==='Retry USDT availability').click();true`);
    await page.wait(`document.body.innerText.includes('Create USDT invoice')`);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await mkdir('generated-artifacts/crypto-checkout', { recursive: true });
    await page.screenshot(`generated-artifacts/crypto-checkout/checkout-${width}.png`);
    // Expanded products cannot create invoices against the old database setup.
    await page.evaluate(`window.caseNumber++;window.renderCheckout('COMMUNICATION_TOPUP');true`);
    await page.wait(`document.body.innerText.includes('expanded crypto database setup')`);
    assert.equal(await page.evaluate(`document.body.innerText.includes('Create USDT invoice')`),false);
    await page.evaluate(`window.config.supportedPurposes=['SUBSCRIPTION','MALVI_SUBSCRIPTION','COMMUNICATION_TOPUP','COMMUNICATION_MINUTES'];window.caseNumber++;window.renderCheckout('COMMUNICATION_TOPUP');true`);
    await page.wait(`document.body.innerText.includes('USD Nanivio credit to add')`);
    assert.equal(await page.evaluate(`!!document.querySelector('input[type=number]')`),true);
    await page.evaluate(`window.caseNumber++;window.renderCheckout('COMMUNICATION_MINUTES');true`);
    await page.wait(`document.body.innerText.includes('Create USDT invoice')&&document.body.innerText.includes('pack-150')`);
    await page.evaluate(`window.renderCheckout('MALVI_SUBSCRIPTION','PAYSTACK');true`);
    await page.wait(`document.body.innerText.includes('Secure payment verification via Paystack')`);
    assert.equal(await page.evaluate(`document.body.innerText.includes('Create USDT invoice')`),false);
    await page.evaluate(`window.showMethods('COMMUNICATION_TOPUP');true`);
    await page.wait(`document.body.innerText.includes('Pay with:')`);
    assert.doesNotMatch(await page.evaluate('document.body.innerText'),/Nanivio credit · P2P/);
    assert.equal(await page.evaluate(`window.calls.some(call=>call.method==='POST')`), false);
  }
  console.log(JSON.stringify({ passed: true, viewports: [390, 1440], separateMethods: true, publicAndLegacy: true, explicitDenial: true, visibleError: true, cryptoDialog: true, topUpsAndMinutes: true, oldDatabaseFailsClosed:true, paymentWrites: 0 }));
} catch (error) {
  console.log(JSON.stringify({ diagnostics: await currentPage?.evaluate(`({
    text:document.body.innerText.slice(0,3500),
    buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText,disabled:e.disabled})),
    calls:window.calls,errors:window.fixtureErrors
  })`) }));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
