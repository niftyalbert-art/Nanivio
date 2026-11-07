import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { quotePaystackOrder, validatePaystackOrderProduct, validateVerifiedOrder } from '../src/server/paystackOrders.ts';
import { balancedPacks } from '../src/lib/balancedCatalogue.ts';

const plan = {
  id:'premium', tier:'premium', name:'Premium', isActive:true,
  priceMonthlyGHS:145, priceMonthlyUSD:9.99, priceAnnualGHS:1450, priceAnnualUSD:99,
  includedLangpretationMinutes:200, includedVoiceMinutes:500, includedMalviRequests:500,
  videoInteractionMinutesLimit:30,
};
const catalog = {
  subscriptionPlans:[plan], malviPlans:[plan],
  communicationMinutePackages:[{ id:'pack', minutes:60, priceGHS:55, priceUSD:3.99, validityDays:30 }],
};

test('Paystack quotes real top-ups and all catalog-backed paid purchase types', () => {
  assert.equal(quotePaystackOrder({ amount:20 }, catalog).amount, 20);
  const minutes = quotePaystackOrder({ purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55 }, catalog);
  assert.equal(minutes.minutes, 60);
  assert.equal(minutes.product?.validityDays, 30);
  for (const purpose of ['SUBSCRIPTION','MALVI_SUBSCRIPTION']) {
    const monthly = quotePaystackOrder({ purpose, planTier:'premium', amount:145 }, catalog);
    assert.equal(monthly.amount, 145);
    assert.equal(monthly.product?.langpretationQuota, 200);
    const annual = quotePaystackOrder({ purpose, planTier:'premium', currency:'USD', billingCycle:'ANNUAL' }, catalog);
    assert.equal(annual.amount, 99);
    assert.equal(annual.product?.periodDays, 365);
  }
});

test('modified prices, quantities, currencies, tiers and invalid top-ups cannot obtain value', () => {
  for (const input of [
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:1 },
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55, minutes:9999 },
    { purpose:'COMMUNICATION_MINUTES', packageId:'missing', amount:55 },
    { purpose:'SUBSCRIPTION', planTier:'premium', amount:1 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'missing', amount:145 },
    { purpose:'SUBSCRIPTION', planTier:'premium', currency:'NGN' },
    { purpose:'SUBSCRIPTION', planTier:'premium', billingCycle:'weekly' },
    { purpose:'invented', amount:10 },
    ...[0,-1,NaN,Infinity,0.001,100001,'broken'].map(amount=>({ amount })),
  ]) assert.throws(()=>quotePaystackOrder(input,catalog));
});

test('verification must match the durable account, exact amount and currency', () => {
  const order = { userId:'owner', amount:145, currency:'GHS' };
  validateVerifiedOrder(order,'owner',145,'GHS');
  for (const args of [
    [undefined,'owner',145,'GHS'], [order,'other',145,'GHS'],
    [order,'owner',1,'GHS'], [order,'owner',145,'USD'], [order,'owner',NaN,'GHS'],
    [order,'owner',145.004,'GHS'],
  ] as const) assert.throws(()=>validateVerifiedOrder(args[0],args[1],args[2],args[3]));
});

test('inactive, missing, free and invalid catalog products cannot be sold',()=>{
  for (const isActive of [true,false]) {
    const invalidCatalog = {
      subscriptionPlans:[{ ...plan, isActive, priceMonthlyGHS:0 }],
      malviPlans:[{ ...plan, isActive, priceMonthlyGHS:0 }],
      communicationMinutePackages:[{ ...catalog.communicationMinutePackages[0], isActive, minutes:0.5 }],
    };
    for (const input of [
      { purpose:'COMMUNICATION_MINUTES', packageId:'pack' },
      { purpose:'SUBSCRIPTION', planTier:'premium' },
      { purpose:'MALVI_SUBSCRIPTION', planTier:'premium' },
    ]) assert.throws(()=>quotePaystackOrder(input,invalidCatalog));
  }
  assert.throws(()=>quotePaystackOrder({ purpose:'COMMUNICATION_MINUTES', packageId:'pack' },{
    ...catalog, communicationMinutePackages:[],
  }));
});

test('legacy intents without snapshots must match the current catalog; valid top-ups remain supported',()=>{
  assert.equal(validatePaystackOrderProduct({
    purpose:'COMMUNICATION_MINUTES', packageId:'pack', minutes:60, amount:55, currency:'GHS',
  },catalog).minutes,60);
  assert.equal(validatePaystackOrderProduct({
    purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:145, currency:'GHS',
  },catalog).product?.videoMinutesAllowed,30);
  for (const currency of ['GHS','USD','NGN','ZAR','KES']) {
    assert.equal(quotePaystackOrder({ amount:20, currency },catalog).amount,20);
    validatePaystackOrderProduct({ purpose:'COMMUNICATION_TOPUP', amount:20, currency },catalog);
  }
});

test('persisted versioned plans retain separate allowances and rebuild nested metadata from the catalog',()=>{
  const versionedCatalog = { ...catalog,
    malviPlans:[{ ...plan, catalogVersion:1, voiceInteractionMinutesLimit:80 }],
  };
  const saved = JSON.parse(JSON.stringify(quotePaystackOrder({
    purpose:'MALVI_SUBSCRIPTION',planTier:'premium',catalogVersion:1,
  },versionedCatalog)));
  saved.product.planSnapshot.voiceInteractionMinutesLimit=999999;
  const validated=validatePaystackOrderProduct(saved,versionedCatalog);
  assert.equal(validated.product?.voiceMinutesAllowed,80);
  assert.equal(validated.product?.videoMinutesAllowed,30);
  assert.equal(validated.product?.planSnapshot.voiceInteractionMinutesLimit,80);
  saved.product.voiceMinutesAllowed=999999;
  assert.throws(()=>validatePaystackOrderProduct(saved,versionedCatalog));
  saved.product.voiceMinutesAllowed=80;
  versionedCatalog.malviPlans[0].catalogVersion=2;
  assert.throws(()=>validatePaystackOrderProduct(saved,versionedCatalog));
});

test('balanced pack terms compare by persisted value and cannot be altered for a larger grant',()=>{
  const packs=balancedPacks(10);
  const packCatalog={ ...catalog, communicationMinutePackages:packs };
  const saved=JSON.parse(JSON.stringify(quotePaystackOrder({
    purpose:'COMMUNICATION_MINUTES',packageId:packs[0].id,
  },packCatalog)));
  validatePaystackOrderProduct(saved,packCatalog);
  saved.product.billingTerms.limits.callSeconds+=60;
  assert.throws(()=>validatePaystackOrderProduct(saved,packCatalog));
});

test('checkout UI uses the signed-in customer and only verification activates paid plans', () => {
  const modal = readFileSync(new URL('../src/components/billing/PaystackTopUpModal.tsx',import.meta.url),'utf8');
  const hub = readFileSync(new URL('../src/components/billing/UniversalBillingHub.tsx',import.meta.url),'utf8');
  const server = readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  assert.doesNotMatch(modal,/user_me|kwame\.mensah|setEmail/);
  assert.match(modal,/authUser\?\.email/);
  assert.match(modal,/setAmount\(isMalvi \? 0 : initialAmount \?\? 50\)/);
  assert.match(modal,/billingClient\.getMalviPlans\(\)/);
  assert.match(modal,/metadata: purpose === 'MALVI_SUBSCRIPTION' \? \{ catalogVersion:/);
  assert.match(hub,/id=\{`btn_plan_select_\$\{plan\.tier\}`\}/);
  assert.match(hub,/price > 0 \? 'Paystack' : 'Select free plan'/);
  assert.match(server,/Paid communication plans require verified Paystack checkout/);
  assert.doesNotMatch(server,/durableOrder \|\| order/);
  assert.match(server,/activatePaystackSubscriptionPersistent\(\{ preflight:true \}\)/);
  assert.doesNotMatch(server,/claimPaystackWebhook|if \(!firstDelivery\)/);
  const persistence = readFileSync(new URL('../src/server/billingPersistence.ts',import.meta.url),'utf8');
  assert.doesNotMatch(persistence,/if \(!data \|\| data\.status === 'FULFILLED'\) return null/);
});
