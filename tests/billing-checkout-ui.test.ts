import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { billingAllowanceDisplay, formatBillingAmount, malviCheckoutAllowanceText } from '../src/lib/billingPresentation';
import { balancedMalviPlans } from '../src/lib/balancedCatalogue';
import { initialMalviCatalog, MALVI_VOICE_DESCRIPTION } from '../src/lib/malviPlanCatalog';

const fixtureKey = '__nanivioBillingRenderFixture';
async function loadHub(resourcePanel = false) {
  const built = await build({
    entryPoints:[resourcePanel ? 'src/components/billing/PlanResourceUsagePanel.tsx' : 'src/components/billing/UniversalBillingHub.tsx'],
    bundle:true, write:false, format:'cjs', platform:'node', packages:'external',
    plugins:[{
      name:'isolated-billing-context',
      setup(builder) {
        builder.onResolve({filter:/context\/NanivioContext$/},()=>({path:'billing-fixture',namespace:'fixture'}));
        builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({
          contents:`export const useNanivio = () => globalThis.${fixtureKey};`,loader:'js',
        }));
      },
    }],
  });
  const result = {exports:{} as any};
  new Function('require','module','exports',built.outputFiles[0].text)(
    createRequire(import.meta.url),result,result.exports,
  );
  return result.exports[resourcePanel ? 'PlanResourceUsagePanel' : 'UniversalBillingHub'];
}

function fixture() {
  const noop=()=>{};
  return {
    authUser:{id:'fixture',email:'fixture@example.test'},
    currentUser:{id:'fixture',name:'Fixture User'},
    billingSummary:{success:true,userId:'fixture',accounts:{communicationAccount:{wallets:[{currency:'GHS',available:'0.00',reserved:'0.00'}]}},subscription:null,recentTransactions:[]},
    billingSyncError:null,
    billingPlans:[],malviPlans:[],userInvoices:[],userDisputes:[],activeUsageSession:null,
    myLanguage:'en',pendingBillingAction:null,malviSubscription:null,
    langpretationMeter:{
      userId:'fixture',available:true,currentPeriodStart:0,
      remainingAllowance:'12.50',monthlyQuota:'15',minutesUsed:'2.50',
      estimatedSavingsGHS:'82.00',estimatedSavingsUSD:'5.88',status:'ACTIVE',
      planName:'Free',tier:'free',currentPeriodEnd:Date.now()+86400000,
      channelBreakdown:{audioCalls:0,videoCalls:0,groupAudioCalls:0,voiceNotes:0,textChat:0},
    },
    refreshBilling:noop,previewBillingCharge:async()=>({}),redeemBillingVoucher:noop,
    createBillingDispute:noop,upgradeSubscriptionPlan:noop,setPendingBillingAction:noop,
    subscribeMalviPlan:noop,setIsMinutesModalOpen:noop,
  };
}

test('confirmed allowance display preserves zero and accepts database decimal strings',()=>{
  assert.deepEqual(billingAllowanceDisplay('0','0'),{label:'0 / 0 min',percentRemaining:0});
  assert.deepEqual(billingAllowanceDisplay('0','200'),{label:'0 / 200 min',percentRemaining:0});
  assert.deepEqual(billingAllowanceDisplay('12.5','50'),{label:'12.5 / 50 min',percentRemaining:25});
  for(const bad of [undefined,null,'',NaN,Infinity,-1,'not a number'])
    assert.deepEqual(billingAllowanceDisplay(bad,50),{label:'Unavailable',percentRemaining:0});
  assert.equal(billingAllowanceDisplay(12,undefined).label,'Unavailable');
});

test('annual Malvi checkout explains monthly allocations without multiplying or changing benefits',()=>{
  assert.equal(malviCheckoutAllowanceText(80,0,'ANNUAL'),
    '80 voice-only minutes · 0 live avatar minutes per monthly allocation. Annual payment includes twelve monthly allocations.');
  assert.equal(malviCheckoutAllowanceText(20,15,'MONTHLY'),
    '20 voice-only minutes · 15 live avatar minutes per 30-day allowance allocation.');
  assert.match(malviCheckoutAllowanceText(undefined,15,'ANNUAL'),/unavailable/);
  const modal=readFileSync('src/components/billing/PaystackTopUpModal.tsx','utf8');
  assert.match(modal,/malviCheckoutAllowanceText\(/);
  assert.doesNotMatch(modal,/minutes per purchased term/);
});

test('old persisted Voice setup instructions are replaced without overwriting custom catalogue copy or prices',()=>{
  const template={
    ...initialMalviCatalog([]).plans[0],status:'PUBLISHED',priceMonthlyUSD:8.25,priceAnnualUSD:90,
    voiceInteractionMinutesLimit:88,videoInteractionMinutesLimit:0,
    description:'A separate voice-only plan. Set its price and allowance before publishing.',
    langpretationCapabilities:'Set the included translation features',
    aiInteractionCapabilities:'Set the included assistance features',
  };
  const [plan]=balancedMalviPlans([template],true);
  assert.equal(plan.description,MALVI_VOICE_DESCRIPTION);
  assert.doesNotMatch(JSON.stringify(plan),/Set the included|before publishing/);
  assert.equal(plan.priceMonthlyUSD,8.25);assert.equal(plan.priceAnnualUSD,90);
  assert.equal(plan.voiceInteractionMinutesLimit,88);
  assert.equal(balancedMalviPlans([{...template,description:'Admin-approved description'}],true)[0].description,'Admin-approved description');
});

test('actual overview shows service credit, not legacy bank funds or demonstration quotas',async()=>{
  const Hub=await loadHub(),value=fixture();
  (value.billingSummary.accounts as any).fintechAccount={wallets:[{currency:'GHS',available:918273.49}]};
  const html=renderHub(Hub,value);
  assert.match(html,/P2P Nanivio credit/);assert.match(html,/USD service credit/);
  assert.match(html,/View Malvi allowances/);assert.match(html,/Unavailable/);
  assert.doesNotMatch(html,/918,273|Fintech Value|Banking &amp; MoMo|Withdrawable:|Malvi AI Requests|416|438|500 min|500 reqs/);
});

test('actual paid-plan overview shows real zero usage and zero allowance without a minimum filled bar',async()=>{
  const Hub=await loadHub(),value=fixture();
  (value.billingSummary as any).subscription={
    status:'ACTIVE',planName:'Confirmed plan',currentPeriodEnd:Date.now()+86400000,
    voiceMinutesQuota:'200',voiceMinutesUsed:'0',langpretationMinutesQuota:'20',langpretationMinutesRemaining:'0',
  };
  const html=renderHub(Hub,value);
  assert.match(html,/200 \/ 200 min/);assert.match(html,/0 \/ 20 min/);
  assert.doesNotMatch(html,/116 \/|438 \/|width:10%/);
});

test('missing, failed and another account billing responses never expose a balance as this user credit',async()=>{
  const Hub=await loadHub();
  for(const mode of ['missing','failed','another-owner']) {
    const value=fixture() as any;
    value.billingSummary.accounts.communicationAccount.wallets[0].available='765432.10';
    if(mode==='missing')value.billingSummary=null;
    if(mode==='failed')value.billingSyncError='Balance unavailable';
    if(mode==='another-owner')value.billingSummary.userId='another-account';
    const html=renderHub(Hub,value);
    assert.match(html,/Unavailable/);
    assert.doesNotMatch(html,/765,432\.10/);
  }
});

test('communication purchase notice names all three methods and estimator offers no cash remittance',async()=>{
  const Hub=await loadHub();
  const html=renderHub(Hub,fixture(),'plans');
  assert.match(html,/verified Paystack payment, confirmed TRON USDT payment, or a successful Nanivio credit debit/);
  assert.doesNotMatch(html,/only after Paystack confirms/);
  assert.doesNotMatch(renderHub(Hub,fixture(),'calculator'),/MoMo Remittance|Amount \(GHS\)/);
});
function renderHub(Hub: React.ComponentType, value: any, tab: any = 'overview') {
  (globalThis as any)[fixtureKey]=value;
  const original=React.useState;
  let calls=0;
  // Select a tab in the actual component without replacing any of its render code.
  React.useState=((initial: any)=>{
    const state=original(initial);
    return ++calls===1 ? [tab,state[1]] : state;
  }) as typeof React.useState;
  try { return renderToStaticMarkup(React.createElement(Hub)); }
  finally { React.useState=original; delete (globalThis as any)[fixtureKey]; }
}

test('actual resource panel preserves confirmed zero and explicitly labels historical storage gaps',async()=>{
  const Panel=await loadHub(true);
  const state={owner:'fixture',data:{
    storage:{usedBytes:0,capacityBytes:2e9,objects:[],legacyChatInventoryComplete:false},
    search:{canResearch:true,legacy:false,remaining:{searchQueries:0},quota:{searchQueries:20}},
  }};
  const html=renderHub(Panel,fixture(),state);
  assert.match(html,/0 GB \/ 2 GB/);
  assert.match(html,/0 remaining \/ 20 per allocation/);
  assert.match(html,/not a verified total for all historical files/);
  assert.doesNotMatch(renderHub(Panel,fixture(),null),/0 GB \/ 2 GB/);
});

test('resource panel hides another account storage and keeps invited Business access distinct from private plans',async()=>{
  const Panel=await loadHub(true);
  const html=renderHub(Panel,fixture(),{owner:'another-user',data:{storage:{objects:[{name:'private-file.pdf'}]}}});
  assert.doesNotMatch(html,/private-file/);assert.match(html,/Unavailable/);
  const business=readFileSync('src/components/malvi/MalviBusinessCollaborationRoom.tsx','utf8');
  assert.doesNotMatch(business,/if \(!isBusiness\) return/);
  assert.match(business,/disabled=\{!isBusiness\}/);
  assert.match(business,/does not upgrade your private Malvi access/);
});

test('amount formatting accepts database decimal strings without assuming a number-only toFixed method',()=>{
  assert.equal(formatBillingAmount('82.00'),'82.00');
  assert.equal(formatBillingAmount('0.00'),'0.00');
  assert.equal(formatBillingAmount(undefined),'Unavailable');
});

test('actual Billing overview renders database decimals, actual zero funds, and an active usage banner',async()=>{
  const Hub=await loadHub();
  const value=fixture();
  (value as any).activeUsageSession={currency:'GHS',currentCost:'1.25',serviceType:'VOICE_CALL',startedAt:Date.now()};
  const html=renderHub(Hub,value);
  assert.match(html,/12\.50/);
  assert.doesNotMatch(html,/Estimated savings|82\.00/);
  assert.match(html,/1\.25/);
  assert.match(html,/0\.00/);
  assert.doesNotMatch(html,/temporary display condition/);
});

test('actual Billing invoices tab renders decimal-string totals and missing numeric values safely',async()=>{
  const Hub=await loadHub();
  const value=fixture();
  (value as any).userInvoices=[{
    id:'invoice',invoiceNumber:'NV-FIXTURE',currency:'GHS',status:'PAID',issuedAt:Date.now(),
    total:'145.00',subtotal:'145.00',
    items:[{id:'item',description:'Premium',quantity:1,unitPrice:'145.00',total:'145.00'}],
  }];
  const html=renderHub(Hub,value,'invoices');
  assert.match(html,/145\.00/);
  assert.match(html,/NV-FIXTURE/);
});

for (const path of [
  'src/components/account/AccountView.tsx',
  'src/components/calls/SubscriptionPlansModal.tsx',
]) {
  test(`${path} routes paid plans to Paystack before free activation`,()=>{
    const source=readFileSync(path,'utf8');
    const handler=source.slice(source.indexOf(path.includes('AccountView')?'const activateCommunicationPlan':'const selectPlan'));
    assert.match(handler,/priceMonthlyGHS/);
    assert.ok(handler.indexOf('openBillingWithPlan(')<handler.indexOf('await upgradeSubscriptionPlan('));
    assert.match(handler,/openBillingWithPlan\([^;]*'SUBSCRIPTION', 'MONTHLY'\)/);
    assert.match(handler,/openBillingWithPlan\([^;]*\);[\s\S]*?return;[\s\S]*?await upgradeSubscriptionPlan/);
  });
}
