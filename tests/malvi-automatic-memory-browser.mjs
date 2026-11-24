import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Actual privacy-control component; local API/auth fixtures only. No provider,
// production-account mutation, speech, avatar session or credits.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MalviContinuityControls} from './src/components/malvi/MalviContinuityControls';
    window.fixtureOwner='a';window.calls=[];window.failNext=false;
    window.store={
      a:{enabled:true,messages:[{id:'a-message',role:'user',text:'PRIVATE A BLUE BICYCLE',created_at:'2026-11-24'}]},
      b:{enabled:true,messages:[{id:'b-message',role:'user',text:'PRIVATE B RED BOAT',created_at:'2026-11-24'}]}
    };
    window.confirm=()=>true;
    window.fetch=async(url,options={})=>{
      if(!String(url).startsWith('/api/assistant/memory'))throw Error('Unexpected provider/network request');
      const owner=new Headers(options.headers).get('x-nanivio-memory-owner');
      const method=options.method||'GET';
      window.calls.push({owner,method,body:options.body?JSON.parse(options.body):null});
      if(owner!==window.fixtureOwner)return new Response(JSON.stringify({success:false,error:'Account changed'}),{status:409});
      if(window.failNext){window.failNext=false;return new Response(JSON.stringify({
        success:false,error:'Saved conversation memory needs database setup.'
      }),{status:503});}
      const state=window.store[owner];
      if(method==='PUT')state.enabled=JSON.parse(options.body).enabled;
      if(method==='DELETE'){state.enabled=false;state.messages=[];}
      const messages=state.enabled?state.messages:[];
      return new Response(JSON.stringify({success:true,enabled:state.enabled,messages,hasPrevious:messages.length>0}));
    };
    function Fixture(){
      const [owner,setOwner]=useState('a');
      window.switchOwner=id=>{window.fixtureOwner=id;setOwner(id);};
      return <MalviContinuityControls key={owner} accountId={owner}/>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` },
  bundle: true, format: 'iife', write: false,
  plugins: [{
    name: 'local-memory-auth',
    setup(builder) {
      builder.onResolve({ filter: /\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: `export const authClient={getToken:()=> 'fixture-token'};`,
      }));
    },
  }],
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text
    : '<!doctype html><div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.page(`http://127.0.0.1:${server.address().port}`);
  const waitFor = expression => page.wait(expression);
  const text = () => page.evaluate('document.body.innerText');
  const clickText = label => page.evaluate(`(()=>{
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));
    if(!button||button.disabled)throw Error('Control unavailable');button.click();return true;
  })()`);
  const toggle = () => page.evaluate(`(()=>{
    const button=document.querySelector('[role="switch"]');
    if(!button||button.disabled)throw Error('Switch unavailable');button.click();return true;
  })()`);
  await waitFor(`document.body.innerText.includes('Automatic · saved to your account')`);
  assert.match(await text(), /trial users and every paid Malvi plan/);
  assert.match(await text(), /Two-person interpretation is excluded/);
  assert.equal(await page.evaluate(`window.calls.filter(c=>c.method==='PUT').length`), 0);
  await clickText('Inspect saved history');
  await waitFor(`document.body.innerText.includes('PRIVATE A BLUE BICYCLE')`);
  assert.doesNotMatch(await text(), /PRIVATE B RED BOAT/);
  await toggle();
  await waitFor(`document.body.innerText.includes('Off · your saved choice')`);
  assert.doesNotMatch(await text(), /PRIVATE A BLUE BICYCLE/);
  await toggle();
  await waitFor(`document.body.innerText.includes('PRIVATE A BLUE BICYCLE')`);
  await page.evaluate(`window.switchOwner('b')`);
  await waitFor(`document.body.innerText.includes('Automatic · saved to your account')&&!document.querySelector('[role="switch"]').disabled`);
  await clickText('Inspect saved history');
  await waitFor(`document.body.innerText.includes('PRIVATE B RED BOAT')`);
  assert.doesNotMatch(await text(), /PRIVATE A BLUE BICYCLE/);
  await clickText('Delete');
  await waitFor(`document.body.innerText.includes('Saved conversation history deleted')`);
  assert.doesNotMatch(await text(), /PRIVATE B RED BOAT/);
  assert.equal(await page.evaluate('window.store.a.messages.length'), 1);
  await page.evaluate(`window.failNext=true;window.switchOwner('a')`);
  await waitFor(`!!document.querySelector('[role="alert"]')`);
  assert.match(await text(), /Memory status unavailable/);
  await clickText('Retry account setting');
  await waitFor(`document.body.innerText.includes('Automatic · saved to your account')`);
  await page.evaluate(`window.switchOwner('b')`);
  await waitFor(`document.body.innerText.includes('Off · your saved choice')`);
  const calls = await page.evaluate('window.calls');
  assert.ok(calls.every(call => ['a', 'b'].includes(call.owner)));
  assert.equal(calls.filter(call => call.method === 'DELETE')[0].owner, 'b');
  const parent = await readFile('src/components/malvi/MalviView.tsx', 'utf8');
  assert.match(parent, /<MalviContinuityControls key=\{currentUser\.id\} accountId=\{currentUser\.id\}/);
  console.log(JSON.stringify({automaticWithoutOptIn:true,visibleNotice:true,offAndReenable:true,
    deleteAndStayOff:true,accountIsolation:true,setupErrorAndRetry:true,providerRequests:0}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
