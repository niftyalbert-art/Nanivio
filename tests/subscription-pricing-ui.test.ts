import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { balancedPricingProposal } from '../src/server/subscriptionPricing.ts';

async function loadReview() {
  const built=await build({
    entryPoints:['src/components/admin/AdminBalancedPricingReview.tsx'],
    bundle:true,write:false,format:'cjs',platform:'node',packages:'external',
    plugins:[{name:'no-ssr-network',setup(builder){
      builder.onResolve({filter:/lib\/billingClient$/},()=>({path:'no-ssr-network',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({
        contents:'export function protectedBillingRequest(){throw new Error("SSR must not issue a billing request");}',loader:'js',
      }));
    }}],
  });
  const module={exports:{} as any};
  new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  return module.exports.AdminBalancedPricingReview;
}
test('actual admin review renders every approved price, limit and draft safety notice',async()=>{
  const Component=await loadReview(),proposal=balancedPricingProposal();
  const original=React.useState;
  let call=0;
  React.useState=((initial:any)=>{
    const [value,set]=original(initial);
    const state=[proposal,false,''];
    const index=call++;
    return [index<state.length?state[index]:value,set];
  }) as typeof React.useState;
  let html:string;
  try {html=renderToStaticMarkup(React.createElement(Component));}
  finally {React.useState=original;}
  for(const plan of proposal.plans)assert.ok(html.includes(plan.name),plan.name);
  for(const pack of proposal.packs)assert.ok(html.includes(pack.name),pack.name);
  assert.match(html,/\$1,399\.99/);
  assert.match(html,/\$7\.99/);
  assert.match(html,/250,000/);
  assert.match(html,/50 GB/);
  assert.match(html,/DRAFT|Draft/);
  assert.match(html,/not purchasable|Not purchasable/i);
  assert.match(html,/twelve monthly allocations/);
  assert.match(html,/not guaranteed|not.*guaranteed/i);
  assert.match(html,/measured and disclosed/);
  assert.doesNotMatch(html,/>\s*(Publish|Activate|Buy now|Pay now)\s*</i);
});
test('review errors do not show guessed prices or a fake successful catalogue',async()=>{
  const Component=await loadReview(),original=React.useState;
  let call=0;
  React.useState=((initial:any)=>{
    const [value,set]=original(initial);
    const state=[null,false,'Access denied by the billing service.'];
    const index=call++;
    return [index<state.length?state[index]:value,set];
  }) as typeof React.useState;
  let html:string;
  try {html=renderToStaticMarkup(React.createElement(Component));}
  finally {React.useState=original;}
  assert.match(html,/Pricing review unavailable/);
  assert.match(html,/Access denied by the billing service/);
  assert.doesNotMatch(html,/\$7\.99/);
  assert.match(html,/Retry/);
});
