// Real components and protected HTTP routes, isolated SQL/auth/payment fixtures.
// No production sign-in bypass, customer writes or paid provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';
import { billingDb } from '../src/server/billingDb.ts';
import { createMalviCatalogService, createMalviPlanRouter } from '../src/server/malviPlanCatalog.ts';
import { MalviCatalogError } from '../src/lib/malviPlanCatalog.ts';
import { createMalviCostRouter } from '../src/server/malviCostCalculator.ts';
import { requireBillingAdmin } from '../src/server/billingAccess.ts';
import { quotePaystackOrder } from '../src/server/paystackOrders.ts';

const db = new PGlite();
await db.exec(await fs.readFile('migrations/012_malvi_plan_catalog.sql', 'utf8'));
let mode = 'normal', role = 'FINANCE_ADMIN', fxDown = false, costDocument = null;
const checkoutRequests = [];
const repo = {
  async read() {
    if (mode === 'setup-down') throw new MalviCatalogError(503, 'PLAN_STORAGE_UNAVAILABLE', 'Apply migrations/012_malvi_plan_catalog.sql.');
    if (mode === 'load-error') throw Error('fixture failed read');
    const { rows } = await db.query("SELECT version,document FROM nanivio_malvi_plan_catalog WHERE catalog_id='primary'");
    return rows[0] ? { version: Number(rows[0].version), document: rows[0].document } : null;
  },
  async compareAndSet(version, document) {
    if (mode === 'conflict') return false;
    const result = version === 0
      ? await db.query("INSERT INTO nanivio_malvi_plan_catalog VALUES ('primary',1,$1::jsonb,now()) ON CONFLICT DO NOTHING RETURNING version", [JSON.stringify(document)])
      : await db.query("UPDATE nanivio_malvi_plan_catalog SET version=version+1,document=$1::jsonb WHERE catalog_id='primary' AND version=$2 RETURNING version", [JSON.stringify(document), version]);
    return result.rows.length === 1;
  },
};
const fx = async () => {
  if (fxDown) throw Error('fixture FX outage');
  return { rate:12,asOf:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),
    source:'Fixture reference rate',attributionUrl:'https://www.exchangerate-api.com' };
};
const service = createMalviCatalogService(repo, () => billingDb.malviPlans, fx);
const bundle = await build({
  stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {AdminMalviBillingWorkspace} from './src/components/admin/AdminMalviBillingWorkspace.tsx';
    import {PaystackTopUpModal} from './src/components/billing/PaystackTopUpModal.tsx';
    import {MalviSubscriptionHub} from './src/components/malvi/MalviSubscriptionHub.tsx';
    window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
    (async()=>{
      if(location.pathname==='/customer')window.fixturePlans=(await(await fetch('/api/billing/malvi-plans')).json()).plans;
      createRoot(document.getElementById('root')).render(location.pathname==='/checkout'?
        <PaystackTopUpModal isOpen onClose={()=>{}} onSuccess={()=>{}} purpose="MALVI_SUBSCRIPTION" planTier="malvi_basic" defaultCurrency="USD" initialAmount={12} catalogVersion={2}/>:
        location.pathname==='/customer'?<MalviSubscriptionHub isOpen onClose={()=>{}}/>:<AdminMalviBillingWorkspace/>);
    })();`, loader:'tsx',resolveDir:process.cwd() },
  bundle:true,platform:'browser',format:'iife',write:false,
  plugins:[{name:'isolated-auth-context-only',setup(b){
    b.onResolve({filter:/\/authClient$/},()=>({path:'auth',namespace:'fixture'}));
    b.onResolve({filter:/\/NanivioContext$/},()=>({path:'context',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'
      ? "export const authClient={getToken:()=> 'fixture-only'};"
      : "export const useNanivio=()=>({authUser:{id:'fixture-user',email:'fixture@example.test'},malviPlans:window.fixturePlans||[],malviSubscription:null,wallets:[],malviCreditBalance:0,refreshBilling:async()=>{},subscribeMalviPlan:async()=>{throw Error('No fixture wallet debit permitted')}});"}));
  }}],
});
const cssFile=(await fs.readdir('dist/assets')).find(name=>name.endsWith('.css'));
const css=await fs.readFile(`dist/assets/${cssFile}`,'utf8');
const app=express();app.use(express.json());
app.get('/fixture.js',(_q,r)=>r.type('js').send(bundle.outputFiles[0].text));
app.get('/fixture.css',(_q,r)=>r.type('css').send(css));
app.use('/api/admin/billing',(q,r,next)=>{
  if(q.header('authorization')!=='Bearer fixture-only')return r.sendStatus(401);
  q.authUser={id:'fixture-admin',role:'ADMIN',accountStatus:'ACTIVE',adminSubRole:role};next();
},requireBillingAdmin);
app.use('/api/admin/billing/malvi-plans',createMalviPlanRouter(service));
app.get('/api/admin/billing/malvi-runtime',(_q,r)=>r.json({success:true,canEdit:['SUPER_ADMIN','FINANCE_ADMIN'].includes(role),
  policy:{version:0,live_minutes_monthly:100,research_monthly:4,analyses_monthly:4,upload_mib_monthly:20}}));
app.use('/api/admin/billing/malvi-costs',createMalviCostRouter(async()=>({
  getBillingCostDocument:async()=>costDocument,
  compareAndSetBillingCostDocument:async(_v,d)=>{costDocument=d;return true;},
}),fx));
app.get('/api/billing/malvi-plans',async(_q,r)=>r.json({success:true,...await service.published()}));
app.post('/api/paystack/initialize',async(q,r)=>{
  const catalog=await service.published();
  const order=quotePaystackOrder(q.body,{malviPlans:catalog.plans,subscriptionPlans:[],communicationMinutePackages:[]});
  checkoutRequests.push({input:q.body,order});
  r.json({success:true,reference:'fixture-no-charge',authorization_url:'https://checkout.paystack.com/fixture',access_code:'fixture'});
});
app.use((_q,r)=>r.type('html').send('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;padding:12px;background:#080e18"><div id="root"></div><script src="/fixture.js"></script></body></html>'));
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await launchBrowser();
const page=await browser.page(origin);
const text=()=>page.evaluate('document.body.innerText');
const goto=async(path='/')=>{await page.command('Page.navigate',{url:origin+path});};
const set=async(selector,value)=>page.evaluate(`(()=>{
  const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field '+${JSON.stringify(selector)});
  const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});
  e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`);
const submit=()=>page.evaluate("document.querySelector('button[type=submit]').click();true");
const confirm=()=>page.evaluate("Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>/confirm|apply|save/i.test(b.textContent)).click();true");
try {
  await goto();
  await page.wait("Boolean(document.querySelector('#malvi-plan-reason'))");
  assert.match(await text(),/Malvi Voice/);
  assert.equal(await page.evaluate("document.querySelector('#malvi_voice-status option[value=PUBLISHED]').disabled"),false);
  await set('#malvi-plan-reason','Save reviewed initial catalogue templates');
  await submit();
  await page.wait("document.body.innerText.includes('version 1')");
  const price="input[id^=malvi_basic][id*=monthly]";
  await set(price,12);
  const featureLines='First feature'+String.fromCharCode(10)+'Second feature';
  await set('#malvi_basic-included',featureLines);
  await set('#malvi-plan-reason','Review Basic price and descriptions');
  await submit();
  await page.wait("Boolean(document.querySelector('[role=dialog]'))");
  await confirm();
  await page.wait("document.body.innerText.includes('version 2')");
  assert.equal((await service.published()).plans.find(p=>p.tier==='malvi_basic').priceMonthlyGHS,144);
  await goto();
  await page.wait("document.querySelector('input[id^=malvi_basic][id*=monthly]')?.value==='12'");
  assert.equal(await page.evaluate("document.querySelector('#malvi_basic-included').value"),featureLines);
  // Both billing tools remain reachable from the same tab.
  await page.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(b=>/cost/i.test(b.textContent)).click();true");
  await page.wait("Boolean(document.querySelector('#malvi-customers'))");
  await page.evaluate("Array.from(document.querySelectorAll('[role=tab]')).find(b=>b.textContent.trim()==='Plans').click();true");
  await page.wait("Boolean(document.querySelector('#malvi-plan-reason'))");
  mode='conflict';
  await set(price,13);await set('#malvi-plan-reason','Check concurrent catalogue revision protection');
  await submit();await page.wait("Boolean(document.querySelector('[role=dialog]'))");await confirm();
  await page.wait("document.body.innerText.includes('Not saved:')");
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(price)}).value`),'13');
  assert.equal((await service.read()).snapshot.version,2);
  mode='normal';
  await page.command('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await fs.mkdir('generated-artifacts',{recursive:true});
  await page.screenshot('generated-artifacts/malvi-plan-manager-mobile.png');
  await page.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await page.screenshot('generated-artifacts/malvi-plan-manager-desktop.png');
  role='AUDITOR';await goto();await page.wait("Boolean(document.querySelector('#malvi-plan-reason'))");
  assert.equal(await page.evaluate("document.querySelector('button[type=submit]').disabled"),true);
  role='FINANCE_ADMIN';mode='setup-down';await goto();await page.wait("Boolean(document.querySelector('#malvi-plan-reason'))");
  assert.match(await text(),/012_malvi_plan_catalog/);
  assert.equal(await page.evaluate("document.querySelector('button[type=submit]').disabled"),true);
  mode='normal';
  await goto('/customer');await page.wait("Boolean(window.fixtureErrors?.length)||document.body.innerText.toLowerCase().includes('malvi basic')");
  assert.deepEqual(await page.evaluate('window.fixtureErrors'),[]);
  assert.match(await text(),/\$12\.00/);
  assert.equal(await page.evaluate('window.fixtureErrors.length'),0);
  await goto('/checkout');await page.wait("document.body.innerText.includes('GHS 144.00')");
  assert.match(await text(),/USD base price.*\$12\.00/);
  assert.match(await text(),/Fixture reference rate/);
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proceed to Paystack')).click();true");
  await page.wait("/open secure|payment reference|fixture-no-charge/i.test(document.body.innerText)");
  assert.equal(checkoutRequests.length,1);
  assert.equal(checkoutRequests[0].input.currency,'GHS');
  assert.equal(checkoutRequests[0].input.amount,144);
  assert.equal(checkoutRequests[0].input.metadata.catalogVersion,2);
  fxDown=true;await goto('/checkout');
  await page.wait("document.body.innerText.includes('quote is unavailable')");
  assert.equal(await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Proceed to Paystack')).disabled"),true);
  assert.equal(checkoutRequests.length,1);
  assert.equal(await page.evaluate('window.fixtureErrors.length'),0);
  await goto('/customer');
  await page.wait("document.body.innerText.toLowerCase().includes('malvi basic')");
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('(GHS)')).click();true");
  await page.wait("/unavailable/i.test(document.body.innerText)");
  assert.equal(await page.evaluate('window.fixtureErrors.length'),0);
  console.log(JSON.stringify({passed:true,checks:12,sqlPersistence:true,mobile:360,desktop:1440,realPayments:0,providerCreditsUsed:0}));
} catch (error) {
  console.error(JSON.stringify({failure:error.message,body:(await text()).slice(0,2500),
    browserErrors:await page.evaluate('window.fixtureErrors||[]')}));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await db.close();
}
