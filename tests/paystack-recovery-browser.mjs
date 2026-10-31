import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Actual recovery component and API client; isolated responses, no real payments.
const built = await build({
  stdin: { loader:'tsx', resolveDir:process.cwd(), contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {PaystackPaymentRecovery} from './src/components/billing/PaystackPaymentRecovery';
    window.calls=[]; window.recovered=0; window.outcome='pending';
    window.fetch=async(url,options)=>{
      window.calls.push(String(url));
      const ok=window.outcome==='success';
      return {ok,status:ok?200:503,json:async()=>ok
        ?{success:true,verified:true,reference:'NV-PSTK-fixture'}
        :{success:false,verified:true,code:'PAYMENT_ACTIVATION_PENDING',
          error:'Paystack confirmed your payment, but activation is pending. Do not pay again.'}};
    };
    createRoot(document.getElementById('root')).render(
      <main className="mx-auto max-w-xl p-4 text-white"><h1 className="mb-4 text-xl">Malvi billing</h1>
        <PaystackPaymentRecovery onRecovered={()=>{window.recovered++}}/>
      </main>);
  ` },
  bundle:true, write:false, format:'iife', define:{'process.env.NODE_ENV':'"production"'},
});
const names = await readdir('dist/assets');
const css = (await Promise.all(names.filter(n=>n.endsWith('.css')).map(n=>readFile(`dist/assets/${n}`,'utf8')))).join('\n');
const server = createServer((req,res)=>{
  if(req.url==='/bundle.js') { res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text); }
  else if(req.url==='/style.css') {res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#171b22"><div id="root"></div><script src="/bundle.js"></script>');}
});
await new Promise(resolve=>server.listen(5198,'0.0.0.0',resolve));
if(process.argv.includes('--preview')) {
  console.log('Isolated recovery preview on port 5198; no real payments.');
} else {
  const browser=await launchBrowser();
  try {
    for(const [width,height] of [[390,844],[1440,900]]) {
      const page=await browser.page('http://127.0.0.1:5198',{width,height});
      await page.wait('!!document.querySelector("summary")');
      await page.evaluate(`document.querySelector('details').open=true;true`);
      await page.evaluate(`(()=>{
        const input=document.querySelector('input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'NV-PSTK-fixture');
        input.dispatchEvent(new Event('input',{bubbles:true}));return true;
      })()`);
      await page.wait('!document.querySelector("button").disabled');
      await page.evaluate(`document.querySelector('form').requestSubmit();true`);
      await page.wait('!!document.querySelector("[role=alert]")');
      assert.match(await page.evaluate('document.body.innerText'),/Do not pay again/);
      assert.equal(await page.evaluate('window.recovered'),0);
      await page.evaluate(`window.outcome='success';document.querySelector('form').requestSubmit();true`);
      await page.wait('!!document.querySelector("[role=status]")');
      assert.equal(await page.evaluate('window.recovered'),1);
      assert.equal(await page.evaluate('window.calls.every(url=>url.includes("/api/paystack/verify/NV-PSTK-fixture"))'),true);
      assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    }
    console.log(JSON.stringify({passed:true,viewports:2,paidPending:true,recovery:true,newCharges:0}));
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
