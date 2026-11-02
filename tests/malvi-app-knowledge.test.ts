import test from 'node:test';
import assert from 'node:assert/strict';
import { configureNanivioAppKnowledge, getNanivioAppKnowledge } from '../src/server/assistant/nanivioAppKnowledge.ts';

test('Malvi reads published prices and actual feature switches, not drafts or provider cost assumptions',async()=>{
  let enabled=true;
  configureNanivioAppKnowledge(()=>({features:{Langpretation:enabled},communicationPlans:[{name:'Communication',priceMonthlyUSD:4}]}));
  const catalogue=async()=>({snapshot:{version:7,plans:[
    {status:'PUBLISHED',name:'Current Voice',tier:'malvi_voice',priceMonthlyUSD:8,priceAnnualUSD:80,
      voiceInteractionMinutesLimit:120,videoInteractionMinutesLimit:0,internalCostUSD:999},
    {status:'DRAFT',name:'Not for sale',priceMonthlyUSD:1000},
  ]}} as any);
  const guide=await getNanivioAppKnowledge(catalogue);
  assert.match(guide,/"priceMonthlyUSD":8/);
  assert.match(guide,/"priceAnnualUSD":80/);
  assert.match(guide,/"voiceInteractionMinutesLimit":120/);
  assert.match(guide,/"Langpretation":true/);
  assert.match(guide,/Communication/);
  assert.doesNotMatch(guide,/Not for sale|internalCostUSD|999/);
  assert.match(guide,/not verified balances or proof of a payment/);
  assert.match(guide,/permission to perform actions/);
  enabled=false;
  assert.match(await getNanivioAppKnowledge(catalogue),/"Langpretation":false/);
});
test('unavailable published billing is explicit, never invented prices',async()=>{
  const guide=await getNanivioAppKnowledge(async()=>{throw Error('fixture outage');});
  assert.match(guide,/Current Malvi prices could not be loaded/);
  assert.match(guide,/do not guess prices/);
  assert.match(guide,/reservation|reserved/);
  assert.match(guide,/Monthly and annual/);
});
