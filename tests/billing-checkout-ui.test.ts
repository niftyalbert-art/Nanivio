import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixtureKey = '__nanivioBillingRenderFixture';
async function loadHub(usePreviousMeter = false) {
  const built = await build({
    entryPoints:['src/components/billing/UniversalBillingHub.tsx'],
    bundle:true, write:false, format:'cjs', platform:'node', packages:'external',
    plugins:[{
      name:'isolated-billing-context',
      setup(builder) {
        builder.onResolve({filter:/context\/NanivioContext$/},()=>({path:'billing-fixture',namespace:'fixture'}));
        builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({
          contents:`export const useNanivio = () => globalThis.${fixtureKey};`,loader:'js',
        }));
        if (usePreviousMeter) builder.onLoad({filter:/LiveLangpretationMeter\.tsx$/},()=>({
          // Reintroduce just the original failing expression in this regression fixture.
          contents:readFileSync('src/components/billing/LiveLangpretationMeter.tsx','utf8')
            .replace('formatBillingAmount(meter.estimatedSavingsGHS)', 'meter.estimatedSavingsGHS.toFixed(2)'),
          loader:'tsx',resolveDir:`${process.cwd()}/src/components/billing`,
        }));
      },
    }],
  });
  const result = {exports:{} as any};
  new Function('require','module','exports',built.outputFiles[0].text)(
    createRequire(import.meta.url),result,result.exports,
  );
  return result.exports.UniversalBillingHub;
}

function fixture() {
  const noop=()=>{};
  return {
    authUser:{id:'fixture',email:'fixture@example.test'},
    currentUser:{id:'fixture',name:'Fixture User'},
    billingSummary:{accounts:{communicationAccount:{wallets:[{currency:'GHS',available:'0.00'}]}},subscription:null,recentTransactions:[]},
    billingPlans:[],malviPlans:[],userInvoices:[],userDisputes:[],activeUsageSession:null,
    myLanguage:'en',pendingBillingAction:null,malviSubscription:null,
    langpretationMeter:{
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
function renderHub(Hub: React.ComponentType, value: any, tab = 'overview') {
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

test('original number-only meter formatting reproduces the decimal-string workspace crash',async()=>{
  const PreviousHub=await loadHub(true);
  assert.throws(()=>renderHub(PreviousHub,fixture()),/estimatedSavingsGHS\.toFixed/);
});

test('actual Billing overview renders database decimals, actual zero funds, and an active usage banner',async()=>{
  const Hub=await loadHub();
  const value=fixture();
  (value as any).activeUsageSession={currency:'GHS',currentCost:'1.25',serviceType:'VOICE_CALL',startedAt:Date.now()};
  const html=renderHub(Hub,value);
  assert.match(html,/82\.00/);
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
