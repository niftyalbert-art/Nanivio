import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Actual return/receipt components and API client. No gateway, database or charge.
const built = await build({
  stdin: { loader:'tsx', resolveDir:process.cwd(), contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {BillingPaymentConfirmation} from './src/components/billing/BillingPaymentConfirmation';
    import {rememberPaystackReturn} from './src/lib/paystackReturn';
    const params=new URLSearchParams(location.search);
    window.mode=params.get('scenario')||'success'; window.calls=[];window.refreshes=0;window.viewed='';
    if(params.has('hint'))rememberPaystackReturn(params.get('hint'), 'NV-PSTK-saved');
    window.fetch=async(url)=>{
      window.calls.push(String(url));
      if(!String(url).includes('/api/paystack/verify/'))throw new Error('Unexpected request; no checkout or charge is permitted');
      const success=window.mode==='success'||window.mode==='repeated';
      return {ok:success,status:success?200:409,json:async()=>success?{
        success:true,verified:true,reference:decodeURIComponent(String(url).split('/').pop()),amount:145,currency:'GHS',
        alreadyFulfilled:window.mode==='repeated',
        purchase:{purpose:'MALVI_SUBSCRIPTION',name:'Malvi Premium',billingCycle:'MONTHLY',voiceMinutes:30,videoMinutes:20}
      }:{success:false,verified:false,code:window.mode==='pending'?'PAYMENT_PENDING':'PAYMENT_NOT_COMPLETED',
        error:window.mode==='pending'?'Payment has not been confirmed. Do not pay again.':'Payment was not completed. No plan activated.'}};
    };
    createRoot(document.getElementById('root')).render(<BillingPaymentConfirmation
      owner={params.get('owner')||'owner-A'} refresh={async()=>{window.refreshes++;}}
      onViewBilling={purpose=>{window.viewed=purpose;}}/>);
  ` },
  bundle:true, platform:'browser', write:false, format:'iife', define:{'process.env.NODE_ENV':'"production"'},
});
const assets = await readdir('dist/assets');
const css = await readFile(`dist/assets/${assets.find(name=>name.endsWith('.css'))}`);
const server = createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/app.js')) {res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);}
  else if(req.url.startsWith('/style.css')) {res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');}
});
await new Promise(resolve=>server.listen(5199,'0.0.0.0',resolve));
const browser = await launchBrowser();
try {
  for(const size of [{width:390,height:844},{width:1440,height:900}]) {
    const page = await browser.page('http://127.0.0.1:5199/?reference=NV-PSTK-confirm&scenario=success');
    await page.command('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor:1, mobile:size.width<600 });
    const navigate = async url => { await page.command('Page.navigate',{url}); };
    await page.wait('Boolean(document.body.textContent.includes("Your subscription is active"))');
    assert.equal(await page.evaluate('window.refreshes'),1);
    assert.equal(await page.evaluate('Boolean(document.body.textContent.includes("Malvi Premium")&&document.body.textContent.includes("30 voice minutes")&&document.body.textContent.includes("20 live avatar minutes"))'),true);
    assert.equal(await page.evaluate('location.search.includes("reference=")'),false);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('View my')).click();true`);
    assert.equal(await page.evaluate('window.viewed'),'MALVI_SUBSCRIPTION');
    await navigate('http://127.0.0.1:5199/?reference=NV-PSTK-pending&scenario=pending');
    await page.wait('Boolean(document.body.textContent.includes("Do not pay again"))');
    assert.equal(await page.evaluate('document.body.textContent.includes("subscription is active")'),false);
    await page.evaluate(`window.mode='success';true`);
    await page.wait('Boolean(document.body.textContent.includes("Your subscription is active"))');
    await navigate('http://127.0.0.1:5199/?reference=NV-PSTK-cancelled&scenario=cancelled');
    await page.wait('Boolean(document.body.textContent.includes("Payment was not completed"))');
    assert.equal(await page.evaluate('window.refreshes'),0);
    assert.equal(await page.evaluate('document.body.textContent.includes("subscription is active")'),false);
    await navigate('http://127.0.0.1:5199/?reference=NV-PSTK-existing&scenario=repeated');
    await page.wait('Boolean(document.body.textContent.includes("No second charge"))');
    await navigate('http://127.0.0.1:5199/?hint=owner-A&owner=owner-B');
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(await page.evaluate('window.calls.length'),0,'another account must not adopt an unowned checkout hint');
    await navigate('http://127.0.0.1:5199/?owner=owner-A');
    await page.wait('Boolean(document.body.textContent.includes("Your subscription is active"))');
    assert.equal(await page.evaluate('window.calls.every(url=>url.includes("/api/paystack/verify/"))'),true);
  }
  console.log(JSON.stringify({passed:true,viewports:2,namedPlan:true,pendingNeverSuccessful:true,repeatedPurchasePreserved:true,ownerIsolation:true,newCharges:0}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
