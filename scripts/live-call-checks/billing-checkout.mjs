import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { launchBrowser } from './cdp.mjs';

// Isolated browser fixtures: real components, mocked context/HTTP, no actual payments.
const output = 'generated-artifacts/billing-checkout-fixture.js';
const contents = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { UniversalBillingHub } from './src/components/billing/UniversalBillingHub';
import { AccountView } from './src/components/account/AccountView';
import { SubscriptionPlansModal } from './src/components/calls/SubscriptionPlansModal';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
const noop=()=>{};
const paid={id:'premium',tier:'individual_premium',name:'Individual Premium',description:'Premium fixture',
 priceMonthlyGHS:145,priceMonthlyUSD:9.99,priceAnnualGHS:1450,priceAnnualUSD:99,
 includedLangpretationMinutes:200,groupCallLimit:12,features:[],isActive:true};
const free={...paid,id:'free',tier:'free',name:'Free',priceMonthlyGHS:0,priceMonthlyUSD:0};
const element=document.createElement('div');
element.id='billing-checkout-fixture';
element.style.cssText='position:fixed;inset:0;z-index:9999;overflow:auto;background:#020617';
document.body.appendChild(element);
const root=ReactDOM.createRoot(element);
let version=0;
window.__billingActions=[];
const originalFetch=window.fetch;
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);
 if(url.pathname==='/api/paystack/initialize'){
  window.__billingActions.push({kind:'checkout',body:JSON.parse(init.body)});
  return new Response(JSON.stringify({success:true,reference:'fixture-only',access_code:'fixture-only',
   authorization_url:'https://checkout.paystack.com/fixture-only',sandbox:true}),{headers:{'Content-Type':'application/json'}});
 }
 if(url.pathname.startsWith('/api/billing/'))return new Response(JSON.stringify({success:true,account:null,businessAccount:null}),{headers:{'Content-Type':'application/json'}});
 return originalFetch(input,init);
};
window.__mountBillingFixture=(view,extra={})=>{
 const base={
  currentUser:{id:'fixture',nvId:'fixture',name:'Fixture User',email:'fixture@example.test',role:'user',myLanguage:'en',country:'Ghana',initials:'FU',avatar:''},
  authUser:{id:'fixture',name:'Fixture User',email:'fixture@example.test',role:'PERSONAL',verificationStatus:'VERIFIED'},
  billingSummary:{accounts:{communicationAccount:{wallets:[{currency:'GHS',available:'0.00'}]}},recentTransactions:[],
   subscription:{tier:'individual_premium',planId:'premium',status:'ACTIVE',pricePaid:0,currentPeriodEnd:Date.now()+86400000,langpretationMinutesQuota:200,langpretationMinutesRemaining:12.5}},
  billingPlans:[free,paid],malviPlans:[],userInvoices:[],userDisputes:[],activeUsageSession:{currency:'GHS',currentCost:'1.25',serviceType:'VOICE_CALL',startedAt:Date.now()},
  wallets:[],appLanguage:'en',myLanguage:'en',speakingLanguage:'en',translationLanguage:'ak',
  pendingBillingAction:null,malviSubscription:null,isSubscribed:false,isFreeTrialActive:false,freeTrialMinutesRemaining:0,
  langpretationMeter:{remainingAllowance:'12.50',monthlyQuota:'200',minutesUsed:'2.50',estimatedSavingsGHS:'82.00',
   estimatedSavingsUSD:'5.88',status:'ACTIVE',tier:'individual_premium',planName:'Premium',currentPeriodEnd:Date.now()+86400000,
   channelBreakdown:{audioCalls:0,videoCalls:0,groupAudioCalls:0,voiceNotes:0,textChat:0}},
  refreshBilling:async()=>{},previewBillingCharge:async()=>({}),redeemBillingVoucher:noop,createBillingDispute:noop,
  upgradeSubscriptionPlan:async(tier)=>window.__billingActions.push({kind:'free',tier}),
  openBillingWithPlan:(tier,purpose,cycle)=>{
   window.__billingActions.push({kind:'route',tier,purpose,cycle});
   queueMicrotask(()=>window.__mountBillingFixture('hub',{pendingBillingAction:{planTier:tier,purpose,cycle,subTab:'plans'}}));
  },
  setPendingBillingAction:noop,subscribeMalviPlan:noop,setIsMinutesModalOpen:noop,...extra
 };
 window.__nanivioBillingBrowserFixture=new Proxy(base,{get:(target,key)=>key in target?target[key]:/^(set|open|update|sign|refresh)/.test(String(key))?noop:undefined});
 const component=view==='account'?React.createElement(AccountView):view==='calls'?React.createElement(SubscriptionPlansModal,{isOpen:true,onClose:noop,onSelectPayment:noop}):React.createElement(UniversalBillingHub);
 root.render(React.createElement(ErrorBoundary,{key:++version,fallbackTitle:'Fixture Billing Error'},component));
};
`;

await fs.mkdir('generated-artifacts', { recursive:true });
await build({
  stdin:{contents,resolveDir:process.cwd(),sourcefile:'billing-checkout-fixture.js'},
  bundle:true,format:'esm',platform:'browser',outfile:output,
  plugins:[{name:'isolated-billing-fixture',setup(builder){
    builder.onResolve({filter:/context\/NanivioContext$/},()=>({path:'fixture',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useNanivio=()=>window.__nanivioBillingBrowserFixture;',loader:'js'}));
    builder.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({
      path:({
        react:'react.js','react-dom':'react-dom.js','react-dom/client':'react-dom_client.js',
        'react/jsx-runtime':'react_jsx-runtime.js','react/jsx-dev-runtime':'react_jsx-dev-runtime.js',
      }[args.path]??(()=>{throw new Error('Unexpected React dependency');})()),
      namespace:'fixture-react',
    }));
    // Vite's optimized CJS React modules expose a default object, not native named exports.
    builder.onLoad({filter:/.*/,namespace:'fixture-react'},args=>({
      contents:"import value from '/node_modules/.vite/deps/"+args.path+"'; module.exports=value;",loader:'js',
    }));
    builder.onResolve({filter:/^\/node_modules\/\.vite\/deps\//},args=>({path:args.path,external:true}));
  }}],
});
const browser=await launchBrowser();
try {
  const page=await browser.page('http://127.0.0.1:5000/');
  page.evaluate=async expression=>{
    const result=await page.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
    return result.result.value;
  };
  await page.wait('document.getElementById("root")?.textContent?.includes("Nanivio")');
  await page.evaluate(`import('/${output}?fixture=${Date.now()}')`);
  await page.evaluate(`window.__mountBillingFixture('hub')`);
  await page.wait(`document.querySelector('#billing-checkout-fixture')?.textContent?.includes('82.00')`);
  assert.doesNotMatch(await page.evaluate(`document.querySelector('#billing-checkout-fixture').textContent`),/Fixture Billing Error|temporary display condition/);
  console.log('PASS: real Billing overview renders decimal-string meter and active-session values');
  for(const view of ['account','calls']){
    await page.evaluate(`window.__billingActions=[];window.__mountBillingFixture('${view}')`);
    await page.wait(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).some(b=>b.textContent.includes('Pay with Paystack'))`);
    await page.evaluate(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).find(b=>b.textContent.includes('Pay with Paystack')).click()`);
    await page.wait(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).some(b=>b.textContent.includes('Proceed to Paystack Checkout'))`);
    await page.evaluate(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).find(b=>b.textContent.includes('Proceed to Paystack Checkout')).click()`);
    await page.wait(`window.__billingActions.some(a=>a.kind==='checkout')`);
    const actions=await page.evaluate('window.__billingActions');
    assert.equal(actions.some(a=>a.kind==='free'),false);
    const checkout=actions.find(a=>a.kind==='checkout').body;
    assert.equal(checkout.purpose,'SUBSCRIPTION');
    assert.equal(checkout.planTier,'individual_premium');
    assert.equal(checkout.amount,145);
    assert.equal(checkout.email,'fixture@example.test');
    console.log('PASS: '+view+' paid selection opens Billing and initializes the actual Paystack modal with the correct plan/price (stubbed HTTP)');
  }
  for(const view of ['account','calls']){
    await page.evaluate(`window.__billingActions=[];window.__mountBillingFixture('${view}')`);
    await page.wait(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).some(b=>b.textContent.toLowerCase().includes('select free'))`);
    await page.evaluate(`Array.from(document.querySelectorAll('#billing-checkout-fixture button')).find(b=>b.textContent.toLowerCase().includes('select free')).click()`);
    await page.wait(`window.__billingActions.some(a=>a.kind==='free')`);
    const actions=await page.evaluate('window.__billingActions');
    assert.equal(actions.filter(a=>a.kind==='free').length,1);
    assert.equal(actions.some(a=>a.kind==='route'||a.kind==='checkout'),false);
    console.log('PASS: '+view+' free selection stays free and does not initialize Paystack');
  }
} finally {
  await browser.close();
  await fs.rm(output,{force:true});
}
