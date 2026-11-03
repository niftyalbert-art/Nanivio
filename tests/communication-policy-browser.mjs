import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {launchBrowser} from '../scripts/live-call-checks/cdp.mjs';

// Isolated components and API fixtures. Never bypasses application auth or
// invokes a payment, microphone, speech provider or customer database.
const result=await build({stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {AdminCommunicationPolicy} from './src/components/admin/AdminCommunicationPolicy';
  import {CommunicationAccessPanel} from './src/components/billing/CommunicationAccessPanel';
  window.__calls=[];window.__navigation={};
  let config={callTrialDays:30,liveTrialMinutes:3,paidTextCharacters:20000,warningSeconds:60};
  const plans=[{id:'free',name:'Free',tier:'free',priceMonthlyUSD:0,priceMonthlyGHS:0,priceAnnualUSD:0,priceAnnualGHS:0,includedVoiceMinutes:0,includedLangpretationMinutes:0},
    {id:'premium',name:'Premium',tier:'individual_premium',priceMonthlyUSD:9.99,priceMonthlyGHS:145,priceAnnualUSD:99,priceAnnualGHS:1450,includedVoiceMinutes:500,includedLangpretationMinutes:200}];
  window.fetch=async(url,options={})=>{
    const method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    window.__calls.push({url:String(url),method,body});
    if(location.search.includes('unavailable'))return Response.json({success:false,error:'Fixture configuration unavailable.'},{status:503});
    if(method==='PUT')config=body.policy;
    const access={policy:config,trialStartedAt:null,trialEndsAt:null,callSecondsRemaining:null,
      liveTrialSecondsRemaining:180,textCharactersRemaining:20000,translatedSecondsRemaining:12000,
      paid:true,paidUntil:'2030-01-01T00:00:00Z',sharedCallMinutes:500};
    return Response.json(String(url).includes('/admin/communication-policy')?{success:true,policy:config,plans}:{success:true,...access});
  };
  createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:1100,margin:'auto'}}><AdminCommunicationPolicy/><CommunicationAccessPanel/></main>);
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'isolated-context',setup(b){
  b.onResolve({filter:/context\/NanivioContext$/},()=>({path:'context',namespace:'fixture'}));
  b.onResolve({filter:/lib\/authClient$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='auth'
    ?'export const authClient={getToken:()=>"isolated-fixture-token"}'
    :'export function useNanivio(){return {setActiveTab:value=>window.__navigation.tab=value,setPendingBillingAction:value=>window.__navigation.action=value}}'}));
}}]});
const css=(await Promise.all((await readdir('dist/assets')).filter(name=>name.endsWith('.css')).map(name=>readFile(`dist/assets/${name}`,'utf8')))).join('\n');
const server=createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);}
  else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body style="background:#151718;color:#f4efe4"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await launchBrowser();
try{
  for(const width of [390,1440]){
    const page=await browser.page(base);
    await page.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
    await page.wait("!!document.querySelector('input[type=number]')");
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await page.evaluate(`(()=>{const input=document.querySelector('input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'45');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    await page.evaluate("[...document.querySelectorAll('button')].find(button=>/save/i.test(button.textContent)).click();true");
    await page.wait("window.__calls.some(call=>call.method==='PUT')");
    assert.equal(await page.evaluate("window.__calls.find(call=>call.method==='PUT').body.policy.callTrialDays"),45);
    await page.evaluate("[...document.querySelectorAll('button')].find(button=>/view plans/i.test(button.textContent)).click();true");
    assert.equal(await page.evaluate('window.__navigation.tab'),'billing');
    assert.equal(await page.evaluate('window.__navigation.action.subTab'),'plans');
    await browser.closePage?.(page);
  }
  const page=await browser.page(`${base}/?unavailable`);
  await page.wait("!!document.querySelector('[role=alert]')");
  assert.ok((await page.evaluate('document.body.textContent')).includes('Fixture configuration unavailable.'));
  await browser.closePage?.(page);
  console.log('Communication policy and user allowance UI passed at mobile and desktop sizes, including real form submission, plan shortcut and unavailable state.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
