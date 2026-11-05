import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCED_PACKS, BALANCED_PLANS, PRICING_RELEASE_REQUIREMENTS,
  estimatePlanContribution, measuredTranslationUnits, pricingPurchaseSnapshot,
  pricingReleaseBlockers, purchaseAllocation, allocationBoundary, usageDebit, validatePurchaseSnapshot,
} from '../src/lib/subscriptionPricing.ts';

test('all approved prices, usage quantities and pack validities are exact', () => {
  assert.deepEqual(BALANCED_PLANS.map(p => [p.monthlyCents, p.annualCents]), [
    [799,8599],[999,10799],[2499,26999],[7999,85999],
    [1499,15999],[3999,43999],[12999,139999],
  ]);
  assert.deepEqual(BALANCED_PLANS.slice(0,4).map(p => [p.limits.voiceSeconds / 60,p.limits.avatarSeconds / 60]),
    [[80,0],[20,15],[50,40],[160,120]]);
  assert.deepEqual(BALANCED_PLANS.slice(4).map(p => [p.limits.callSeconds/60,p.limits.translationUnits/80_000,
    p.limits.textRequests,p.limits.textCharacters,p.limits.storageBytes/1e9]),
  [[200,20,300,20_000,2],[500,60,1000,75_000,10],[1500,200,3000,250_000,50]]);
  assert.deepEqual(BALANCED_PACKS.map(p => p.priceCents),[299,1299,3499,299,999,2499,499,1499,499,499]);
  assert.ok(BALANCED_PACKS.every(p => p.validityDays === 30));
  assert.equal(BALANCED_PLANS[2].limits.searchQueries,20);
  assert.equal(BALANCED_PLANS[3].limits.searchQueries,100);
});
test('new prices have the modeled contribution after full use, reserve and payment fee', () => {
  for (const plan of BALANCED_PLANS) {
    const estimate = estimatePlanContribution(plan);
    assert.ok(estimate.monthlyContributionPercent>59 && estimate.monthlyContributionPercent<65, plan.name);
    assert.ok(estimate.annualContributionPercent>55 && estimate.annualContributionPercent<61, plan.name);
    assert.ok(plan.annualCents < plan.monthlyCents*12);
  }
});
test('snapshots are independent of current catalogue and snapshots from other purchases', () => {
  const before = pricingPurchaseSnapshot('malvi_premium');
  const saved = structuredClone(before);
  before.limits.avatarSeconds = 1;
  assert.equal(pricingPurchaseSnapshot('malvi_premium').limits.avatarSeconds,2400);
  assert.equal(saved.limits.avatarSeconds,2400);
  assert.equal(saved.allocations,1);
  assert.equal(pricingPurchaseSnapshot('malvi_premium','ANNUAL').allocations,12);
  assert.throws(() => pricingPurchaseSnapshot('nonexistent'));
  assert.throws(() => pricingPurchaseSnapshot('malvi_basic','INVALID' as any));
});
test('annual purchase gets exactly twelve calendar allocations, including month-end and leap-year anchors', () => {
  const snapshot=pricingPurchaseSnapshot('malvi_business','ANNUAL');
  const start=Date.parse('2028-01-31T12:34:56.789Z');
  assert.equal(new Date(allocationBoundary(start,1)).toISOString(),'2028-02-29T12:34:56.789Z');
  assert.equal(new Date(allocationBoundary(start,2)).toISOString(),'2028-03-31T12:34:56.789Z');
  for (let i=0;i<12;i++) {
    const allocation=purchaseAllocation(snapshot,start,allocationBoundary(start,i));
    assert.equal(allocation?.index,i);
    assert.equal(allocation?.limits.avatarSeconds,120*60);
  }
  assert.equal(purchaseAllocation(snapshot,start,allocationBoundary(start,12)),null);
  assert.equal(purchaseAllocation(snapshot,start,start-1),null);
});
test('packs and monthly terms expire after 30 days, not twelve calendar allocations', () => {
  const start=Date.parse('2028-01-31T00:00:00Z'),end=start+30*86400000;
  for (const id of ['call_100','text_300','malvi_voice']) {
    const snapshot=pricingPurchaseSnapshot(id);
    assert.equal(purchaseAllocation(snapshot,start,end-1)?.index,0);
    assert.equal(purchaseAllocation(snapshot,start,end),null);
  }
});
test('all malformed benefits fail closed; no unlimited, negative or fractional grants', () => {
  for (const mutate of [
    (s:any)=>s.limits.textCharacters=-1,
    (s:any)=>s.limits.voiceSeconds=1.5,
    (s:any)=>s.limits.callSeconds=Infinity,
    (s:any)=>s.limits.searchQueries=Number.MAX_SAFE_INTEGER+1,
    (s:any)=>s.limits.other=10,
    (s:any)=>delete s.limits.storageBytes,
    (s:any)=>s.allocations=13,
    (s:any)=>s.validityDays=365,
    (s:any)=>s.priceCentsUSD=0,
    (s:any)=>s.pooled='yes',
  ]) {
    const snapshot=pricingPurchaseSnapshot('malvi_basic');
    mutate(snapshot);
    assert.throws(()=>validatePurchaseSnapshot(snapshot));
  }
});
test('voice, avatar, text, search and translated notes debit the intended resource only', () => {
  assert.deepEqual(usageDebit('avatar',30),{avatarSeconds:30});
  assert.deepEqual(usageDebit('voice',30),{voiceSeconds:30});
  assert.deepEqual(usageDebit('text',100),{textRequests:1,textCharacters:100});
  assert.deepEqual(usageDebit('voiceNote',1500),{translationUnits:1500});
  assert.deepEqual(usageDebit('search',3),{searchQueries:3});
  for (const invalid of [0,-1,.1,NaN,Infinity]) assert.throws(()=>usageDebit('call',invalid));
});
test('route accounting uses a versioned measured cost, not a fixed country multiplier', () => {
  assert.equal(measuredTranslationUnits({version:'palabra-public-example',rates:{directionSeconds:40_000/60}},
    {directionSeconds:120}),80_000);
  assert.equal(measuredTranslationUnits({version:'khaya-standard-example',rates:{requests:89.95/20_000*1e6}},
    {requests:3}),13493);
  assert.throws(()=>measuredTranslationUnits({version:'',rates:{requests:1}},{requests:3}));
  assert.throws(()=>measuredTranslationUnits({version:'v1',rates:{requests:1}},{unknown:3}));
  assert.throws(()=>measuredTranslationUnits({version:'v1',rates:{requests:1}},{}));
});
test('publishing stays blocked unless every real integration is verified', () => {
  assert.equal(pricingReleaseBlockers({}).length,8);
  const evidence=Object.fromEntries(PRICING_RELEASE_REQUIREMENTS.map(k=>[k,true]));
  assert.deepEqual(pricingReleaseBlockers(evidence),[]);
  assert.deepEqual(pricingReleaseBlockers({...evidence,allPaymentRails:false}),['allPaymentRails']);
});
