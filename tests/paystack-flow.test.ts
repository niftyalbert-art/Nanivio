import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { pricingPurchaseSnapshot } from '../src/lib/subscriptionPricing.ts';
import { assertLivePaystackPayment, paystackLiveConfigurationError } from '../src/server/paystackPaymentSafety.ts';
import {verifyPaystackTransaction,paystackVerificationDiagnostic} from '../src/server/paystackVerification.ts';
import {createPaystackReconciler} from '../src/server/paystackReconciliation.ts';
import {PAYSTACK_PURPOSES} from '../src/server/paystackOrders.ts';
import { applyCommunicationCatalogue } from '../src/server/communicationRoutes.ts';
import { quotePaystackOrder, validatePaystackOrderProduct, validateVerifiedOrder } from '../src/server/paystackOrders.ts';

// Execute the actual production handlers with a stubbed gateway and isolated stores.
// No real provider credential, network payment, or customer account is used.
const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
function handlerText(path: string): string {
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === path) result = node.arguments.at(-1)!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `Missing actual route ${path}`);
  return result;
}
const fulfill = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fulfillPaystackOrder')!;

function system() {
  const orders = new Map<string, any>(), payments = new Map<string, any>(), provider = new Map<string, any>();
  const deliveries: any[] = [], fulfilled = new Set<string>();
  let failNextDelivery = false;
  const plan = { id:'premium', tier:'premium', name:'Premium', isActive:true,
    priceMonthlyGHS:145, priceMonthlyUSD:9.99, priceAnnualGHS:1450, priceAnnualUSD:99,
    includedLangpretationMinutes:200, includedVoiceMinutes:500, videoInteractionMinutesLimit:30,
    voiceInteractionMinutesLimit:30, catalogVersion:undefined as number | undefined };
  const deliver = async (payload: any) => {
    if (failNextDelivery) { failNextDelivery = false; throw new Error('Temporary ledger outage'); }
    const alreadyFulfilled = payments.has(payload.referenceId);
    if (!payments.has(payload.referenceId)) {
      deliveries.push(payload);
      payments.set(payload.referenceId, { user_id:payload.userId });
    }
    return { success:true, alreadyFulfilled, subscription:{ planName:'Premium', videoMinutesAllowed:30 }, balanceAfter:payload.amount };
  };
  const context: any = {
    Buffer, crypto, AbortSignal, quotePaystackOrder, validatePaystackOrderProduct, validateVerifiedOrder,
    applyCommunicationCatalogue,
    communicationAccess:{policy:async()=>({callTrialDays:30,liveTrialMinutes:3,paidTextCharacters:20000,warningSeconds:60,plans:[]})},
    assertLivePaystackPayment, paystackLiveConfigurationError,
    process:{ env:{ PAYSTACK_SECRET_KEY:'sk_live_fixture_only' } },
    authenticatedUserId:(req: any)=>req.authId,
    persistentAuth:{ findById:async()=>({ email:'fixture@example.test' }) },
    normalizedBillingEnabled:()=>true,
    billingDb:{ subscriptionPlans:[plan], malviPlans:[plan],
      communicationMinutePackages:[{ id:'pack', minutes:60, priceGHS:55, priceUSD:3.99, validityDays:30 }] },
    malviCatalogService:{ published:async()=>({plans:[plan]}) },
    pendingPaystackOrders:new Map(),
    savePaystackOrder:async(ref: string,_user: string,order: any)=>orders.set(ref,order),
    getPaystackOrder:async(ref: string)=>orders.get(ref),
    markPaystackOrderFulfilled:async(reference: string)=>{ fulfilled.add(reference); },
    getPersistentPayment:async(_provider: string,ref: string)=>payments.get(ref),
    activatePaystackSubscriptionPersistent:async(p: any)=>p.preflight?{ success:true, ready:true }:deliver(p),
    purchaseCommunicationMinutesPersistent:deliver,
    activateMalviSubscriptionPersistent:async(p: any)=>p.preflight?{ success:true, ready:true }:deliver(p),
    activateMalviSubscriptionFromWalletPersistent:deliver,
    paystackTopUpPersistent:deliver,
    fetch:async(url: string,init: any)=>{
      if (url.endsWith('/initialize')) {
        const request = JSON.parse(init.body);
        provider.set(request.reference, { ...request, domain:'live', status:'success' });
        assert.equal(request.email,'fixture@example.test');
        return { ok:true, json:async()=>({ status:true, data:{
          authorization_url:'https://checkout.paystack.com/fixture', access_code:'fixture',
          reference:request.reference,
        } }) };
      }
      return Response.json({ status:true, data:provider.get(decodeURIComponent(url.split('/').at(-1)!)) });
    },
  };
  // Legacy gateway fixtures retain original paid snapshots. New catalogue
  // prices and SQL readiness have separate rollout coverage.
  context.saleCatalogue = async (input: any) => input.purpose === 'MALVI_SUBSCRIPTION'
    ? {...context.billingDb,malviPlans:(await context.malviCatalogService.published()).plans} : context.billingDb;
  context.getServerSupabase = () => ({rpc:async()=>({data:{ready:true,pricingVersion:'balanced-2026-11'},error:null})});
  context.verifyPaystackTransaction=(reference:string,key:string)=>verifyPaystackTransaction(reference,key,{fetcher:context.fetch});
  context.paystackVerificationDiagnostic=paystackVerificationDiagnostic;
  const sandbox = vm.createContext(context);
  const compile = (text: string) => {
    vm.runInContext(ts.transpile(`globalThis.result = ${text}`, { target:ts.ScriptTarget.ES2022 }), sandbox);
    return context.result;
  };
  context.fulfillPaystackOrder = compile(fulfill.getText(ast));
  context.requireBalancedBillingSetup = compile(ast.statements.find(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'requireBalancedBillingSetup')!.getText(ast));
  const initialize = compile(handlerText('/api/paystack/initialize'));
  const verify = compile(handlerText('/api/paystack/verify/:reference'));
  const webhook = compile(handlerText('/api/paystack/webhook'));
  const malviWallet = compile(handlerText('/api/billing/malvi-subscription/change'));
  async function call(handler: any,req: any) {
    const res: any = { code:200, body:null, status(code: number){ this.code=code; return this; },
      json(body: any){ this.body=body; return this; }, send(body: any){ this.body=body; return this; } };
    await handler(req,res);
    return res;
  }
  return { context, plan, orders, deliveries, fulfilled, provider, initialize, verify, webhook, malviWallet, call,
    failOnce:()=>{ failNextDelivery=true; } };
}

test('new subscription checkout requires rollout setup before contacting the payment provider',async()=>{
  const s=system();
  s.context.billingDb.subscriptionPlans=[{...s.plan,id:'plan_individual_premium',tier:'individual_premium',
    priceMonthlyUSD:14.99,priceAnnualUSD:159.99,includedVoiceMinutes:200,includedLangpretationMinutes:20,
    billingTerms:pricingPurchaseSnapshot('plan_individual_premium')}];
  s.context.getServerSupabase=()=>({rpc:async()=>({data:null,error:{code:'PGRST202'}})});
  const res=await s.call(s.initialize,{authId:'buyer',body:{purpose:'SUBSCRIPTION',planTier:'individual_premium',currency:'USD'}});
  assert.equal(res.code,400);
  assert.match(res.body.error,/billing setup is required/);
  assert.equal(s.provider.size,0);
  assert.equal(s.orders.size,0);
});
test('actual new monthly and annual checkout handlers charge the approved price and fulfil the accepted snapshot',async()=>{
  for(const billingCycle of ['MONTHLY','ANNUAL']) {
    const s=system();
    s.context.billingDb.subscriptionPlans=[{...s.plan,id:'plan_individual_premium',tier:'individual_premium',
      priceMonthlyUSD:14.99,priceAnnualUSD:159.99,includedVoiceMinutes:200,includedLangpretationMinutes:20,
      billingTerms:pricingPurchaseSnapshot('plan_individual_premium')}];
    const res=await s.call(s.initialize,{authId:'buyer',body:{purpose:'SUBSCRIPTION',planTier:'individual_premium',currency:'USD',billingCycle}});
    assert.equal(res.code,200,JSON.stringify(res.body));
    const order=s.orders.get(res.body.reference);
    assert.equal(order.amount,billingCycle==='ANNUAL'?159.99:14.99);
    assert.equal(order.product.billingTerms.allocations,billingCycle==='ANNUAL'?12:1);
    const verified=await s.call(s.verify,{authId:'buyer',params:{reference:res.body.reference}});
    assert.equal(verified.code,200,JSON.stringify(verified.body));
    assert.deepEqual(JSON.parse(JSON.stringify(s.deliveries[0].metadata.billingTerms)),order.product.billingTerms);
  }
});

function checkout(purpose: typeof PAYSTACK_PURPOSES[number], currency = 'GHS', billingCycle = 'MONTHLY') {
  return { purpose, currency, billingCycle,
    ...(purpose === 'COMMUNICATION_TOPUP' ? { amount: 20 } :
      purpose === 'COMMUNICATION_MINUTES' ? { packageId: 'pack' } : { planTier: 'premium' }) };
}

for (const purpose of PAYSTACK_PURPOSES) {
  test(`${purpose}: card and Mobile Money pending/cancelled payments never grant value; verified retries grant once`, async () => {
    for (const channel of ['card', 'mobile_money']) {
      const s = system();
      const init = await s.call(s.initialize, { authId: 'owner', body: checkout(purpose) });
      assert.equal(init.code, 200, JSON.stringify(init.body));
      const reference = init.body.reference;
      for (const status of ['pending', 'ongoing', 'failed', 'abandoned', 'reversed']) {
        Object.assign(s.provider.get(reference), { channel, status });
        assert.equal((await s.call(s.verify, { authId: 'owner', params: { reference } })).code, 409);
        assert.equal(s.deliveries.length, 0);
      }
      s.provider.get(reference).status = 'success';
      s.failOnce();
      const pending = await s.call(s.verify, { authId: 'owner', params: { reference } });
      assert.equal(pending.body.code, 'PAYMENT_ACTIVATION_PENDING');
      assert.equal(pending.body.verified, true);
      s.context.pendingPaystackOrders.clear(); // buyer closes checkout / server restarts
      const recovered = await s.call(s.verify, { authId: 'owner', params: { reference } });
      assert.equal(recovered.body.success, true);
      assert.equal(recovered.body.purchase.purpose, purpose);
      if (purpose.includes('SUBSCRIPTION')) {
        assert.equal(recovered.body.purchase.name, 'Premium');
        assert.equal(recovered.body.purchase.billingCycle, 'MONTHLY');
      }
      assert.equal((await s.call(s.verify, { authId: 'owner', params: { reference } })).body.alreadyFulfilled, true);
      assert.equal(s.deliveries.length, 1);
      assert.ok(s.fulfilled.has(reference));
    }
  });
}

test('paid minute-package delivery blocks deleted products and recovers without changing minutes or validity', async () => {
  const s = system();
  const init = await s.call(s.initialize, { authId: 'owner', body: checkout('COMMUNICATION_MINUTES') });
  const packages = s.context.billingDb.communicationMinutePackages;
  s.context.billingDb.communicationMinutePackages = [];
  const blocked = await s.call(s.verify, { authId: 'owner', params: { reference: init.body.reference } });
  assert.equal(blocked.code,503);
  assert.equal(blocked.body.code,'PAYMENT_ACTIVATION_PENDING');
  assert.equal(s.deliveries.length,0);
  s.context.billingDb.communicationMinutePackages = packages;
  const result = await s.call(s.verify, { authId: 'owner', params: { reference: init.body.reference } });
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(s.deliveries[0].minutes, 60);
  assert.equal(s.deliveries[0].validityDays, 30);
  assert.equal(s.deliveries[0].price, 55);
});

test('retry repairs the durable order marker after ledger credit committed, without another delivery', async () => {
  for (const purpose of PAYSTACK_PURPOSES) {
    const s = system(), mark = s.context.markPaystackOrderFulfilled;
    let unavailable = true;
    s.context.markPaystackOrderFulfilled = async (reference: string) => {
      if (unavailable) throw new Error('Fixture order-status update unavailable');
      await mark(reference);
    };
    const init = await s.call(s.initialize, { authId: 'owner', body: checkout(purpose) });
    const reference = init.body.reference;
    assert.equal((await s.call(s.verify, { authId: 'owner', params: { reference } })).body.code, 'PAYMENT_ACTIVATION_PENDING');
    assert.equal(s.deliveries.length, 1);
    assert.equal(s.fulfilled.has(reference), false);
    unavailable = false;
    assert.equal((await s.call(s.verify, { authId: 'owner', params: { reference } })).body.alreadyFulfilled, true);
    assert.equal(s.deliveries.length, 1);
    assert.ok(s.fulfilled.has(reference));
    assert.equal(s.context.pendingPaystackOrders.has(reference), false);
  }
});

test('all billing routes commit usable benefits in PostgreSQL, roll back failed delivery and recover without double credit', async t => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE nanivio_users(id TEXT PRIMARY KEY);');
    for (const migration of ['002_billing_normalized_ledger', '005_malvi_credit_and_usage', '007_communication_plan_entitlements',
      '008_paystack_paid_subscriptions', '009_billing_malvi_expression_fix', '012_malvi_plan_catalog', '013_malvi_live_allowances',
      '014_paystack_malvi_activation', '020_malvi_business_rooms', '021_communication_access_policy']) {
      await pg.exec(readFileSync(`migrations/${migration}.sql`, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
    }
    await pg.exec('UPDATE nanivio_malvi_runtime_policy SET live_minutes_monthly=10000;');
    let index = 0;
    const rpc = async (name: string, payload: any) => (await pg.query<{result:any}>(
      `SELECT ${name}($1::jsonb) AS result`, [JSON.stringify(payload)])).rows[0].result;
    const command = async (name: string, payload: any) => (await pg.query<{result:any}>(
      'SELECT nanivio_billing_command($1,$2::jsonb) AS result', [name, JSON.stringify(payload)])).rows[0].result;
    for (const purpose of PAYSTACK_PURPOSES) for (const channel of ['card', 'mobile_money']) for (const currency of ['GHS', 'USD']) {
      for (const cycle of purpose.includes('SUBSCRIPTION') ? ['MONTHLY', 'ANNUAL'] : ['MONTHLY']) {
        await t.test(`${purpose} / ${channel} / ${currency} / ${cycle}`, async () => {
          const user = `audit_user_${++index}`, s = system();
          await pg.query('INSERT INTO nanivio_users(id) VALUES($1)', [user]);
          s.context.activatePaystackSubscriptionPersistent = (p: any) => rpc('nanivio_activate_paystack_subscription', p);
          s.context.activateMalviSubscriptionPersistent = (p: any) => rpc('nanivio_activate_paystack_malvi', p);
          s.context.purchaseCommunicationMinutesPersistent = (p: any) => command('COMMUNICATION_MINUTES_PURCHASE', p);
          s.context.paystackTopUpPersistent = (p: any) => command('PAYSTACK_TOPUP', p);
          s.context.getPersistentPayment = async (_provider: string, reference: string) =>
            (await pg.query('SELECT * FROM nanivio_payments WHERE provider_reference=$1', [reference])).rows[0];
          const body = { ...checkout(purpose, currency, cycle), ...(purpose === 'COMMUNICATION_TOPUP' ? { amount: 100 } : {}) };
          const init = await s.call(s.initialize, { authId: user, body });
          assert.equal(init.code, 200, JSON.stringify(init.body));
          const reference = init.body.reference;
          Object.assign(s.provider.get(reference), { channel });
          const event = { event: 'charge.success', data: s.provider.get(reference) };
          const rawBody = Buffer.from(JSON.stringify(event));
          const signature = crypto.createHmac('sha512', 'sk_live_fixture_only').update(rawBody).digest('hex');
          const notification = () => s.call(s.webhook, { body: event, rawBody, headers: { 'x-paystack-signature': signature } });
          const count = async (table: string) => Number((await pg.query<any>(
            `SELECT count(*) AS n FROM ${table} WHERE user_id=$1`, [user])).rows[0].n);
          // Force a downstream payment insert failure in an isolated database.
          // No payment, wallet credit or subscription may survive the rollback.
          await pg.exec(`ALTER TABLE nanivio_payments ADD CONSTRAINT audit_delivery_failure CHECK (provider_reference <> '${reference}') NOT VALID;`);
          const failed = await notification();
          assert.equal(failed.code, 500, JSON.stringify(failed.body));
          assert.equal(await count('nanivio_payments'), 0);
          assert.equal(await count('nanivio_wallet_ledger'), 0);
          assert.equal(await count('nanivio_subscriptions'), 0);
          assert.equal(await count('nanivio_malvi_subscriptions'), 0);
          await pg.exec('ALTER TABLE nanivio_payments DROP CONSTRAINT audit_delivery_failure;');
          s.context.pendingPaystackOrders.clear();
          const recovery = createPaystackReconciler({
            list: async () => [...s.orders].map(([ref, order]) => ({ ...order, reference: ref })),
            verify: async ref => s.provider.get(ref),
            fulfil: async (order, transaction) => { await s.context.fulfillPaystackOrder({
              reference: order.reference, userId: order.userId, verifiedAmount: transaction.amount / 100,
              verifiedCurrency: transaction.currency, order }); },
            checked: async () => {}, report: (_ref, error) => { throw error; },
          });
          await recovery(); // no browser callback or webhook retry required
          assert.ok(s.fulfilled.has(reference));
          assert.equal(await count('nanivio_payments'), 1);
          if (purpose !== 'COMMUNICATION_TOPUP') assert.equal(await count('nanivio_invoices'), 1);
          if (purpose === 'COMMUNICATION_TOPUP') {
            const wallet = (await pg.query<any>("SELECT available FROM nanivio_wallets WHERE user_id=$1 AND currency=$2 AND account_type='COMMUNICATION'", [user, currency])).rows[0];
            assert.equal(Number(wallet.available), 100);
            const price = currency === 'GHS' ? 55 : 3.99;
            await command('COMMUNICATION_MINUTES_FROM_WALLET', {
              userId: user, currency, minutes: 60, price, validityDays: 30,
              referenceId: `wallet_${reference}`, transactionId: `wallet_tx_${reference}`,
              subscriptionId: `wallet_minutes_${reference}`, paymentMethod: 'NANIVIO_CREDIT',
            });
            const spent = (await pg.query<any>("SELECT available FROM nanivio_wallets WHERE user_id=$1 AND currency=$2 AND account_type='COMMUNICATION'", [user, currency])).rows[0];
            assert.equal(Number(spent.available), 100-price, 'the deposited funds must actually buy a minute package');
          } else if (purpose === 'MALVI_SUBSCRIPTION') {
            const term = (await pg.query<any>('SELECT * FROM nanivio_malvi_subscriptions WHERE user_id=$1', [user])).rows[0];
            assert.equal(Number(term.voice_minutes_allowed), 30);
            assert.equal(Number(term.video_minutes_allowed), 30);
            assert.equal(term.auto_renew, false);
            assert.equal((new Date(term.current_period_end).getTime()-new Date(term.current_period_start).getTime())/86400000, cycle === 'ANNUAL' ? 365 : 30);
            await pg.query("SELECT nanivio_reserve_malvi_live($1,$2,'voice',60)", [user, `audit_lease_${index}`]);
          } else {
            const quota = (await pg.query<any>('SELECT sum(langpretation_minutes_remaining) AS n FROM nanivio_subscriptions WHERE user_id=$1', [user])).rows[0];
            assert.equal(Number(quota.n), purpose === 'COMMUNICATION_MINUTES' ? 60 : 200);
            if (purpose === 'SUBSCRIPTION') {
              const term = (await pg.query<any>("SELECT * FROM nanivio_subscriptions WHERE user_id=$1 AND tier='premium'", [user])).rows[0];
              assert.equal(term.auto_renew, false);
              assert.equal(term.currency, currency);
              assert.equal((new Date(term.current_period_end).getTime()-new Date(term.current_period_start).getTime())/86400000, cycle === 'ANNUAL' ? 365 : 30);
            }
            await rpc('nanivio_langpretation_usage', { userId: user, minutes: 1, audioSeconds: 60, eventId: `audit_usage_${index}` });
            const consumed = (await pg.query<any>('SELECT sum(langpretation_minutes_remaining) AS n FROM nanivio_subscriptions WHERE user_id=$1', [user])).rows[0];
            assert.equal(Number(consumed.n), purpose === 'COMMUNICATION_MINUTES' ? 59 : 199);
          }
          const before = JSON.stringify((await pg.query<any>(`SELECT
            (SELECT sum(available) FROM nanivio_wallets WHERE user_id=$1) AS wallet,
            (SELECT sum(langpretation_minutes_remaining) FROM nanivio_subscriptions WHERE user_id=$1) AS communication,
            (SELECT sum(credit_balance) FROM malvi_credit_accounts WHERE user_id=$1) AS malvi`, [user])).rows);
          // Race signed webhook delivery and authenticated browser verification.
          const repeated = await Promise.all([notification(), notification(), s.call(s.verify, { authId: user, params: { reference } })]);
          assert.ok(repeated.every(r => r.code === 200), JSON.stringify(repeated.map(r => r.body)));
          assert.equal(await count('nanivio_payments'), 1);
          const after = JSON.stringify((await pg.query<any>(`SELECT
            (SELECT sum(available) FROM nanivio_wallets WHERE user_id=$1) AS wallet,
            (SELECT sum(langpretation_minutes_remaining) FROM nanivio_subscriptions WHERE user_id=$1) AS communication,
            (SELECT sum(credit_balance) FROM malvi_credit_accounts WHERE user_id=$1) AS malvi`, [user])).rows);
          assert.equal(after, before, 'retries must not refill consumed balances or allowances');
          assert.equal((await s.call(s.verify, { authId: 'different_account', params: { reference } })).code, 403);
        });
      }
    }
  } finally { await pg.close(); }
});

test('Malvi first delivery blocks catalogue changes or outages and recovers the original voice/video terms', async () => {
  const s = system();
  s.plan.catalogVersion = 1;
  s.plan.voiceInteractionMinutesLimit = 80;
  s.plan.videoInteractionMinutesLimit = 10;
  const init = await s.call(s.initialize, {authId:'owner',body:{
    purpose:'MALVI_SUBSCRIPTION',planTier:'premium',currency:'GHS',amount:145,metadata:{catalogVersion:1},
  }});
  assert.equal(init.code,200,JSON.stringify(init.body));
  s.plan.name = 'Different future name';
  s.plan.voiceInteractionMinutesLimit = 1;
  s.plan.videoInteractionMinutesLimit = 0;
  s.plan.priceMonthlyGHS = 700;
  const published = s.context.malviCatalogService.published;
  const changed = await s.call(s.verify,{authId:'owner',params:{reference:init.body.reference}});
  assert.equal(changed.code,503);
  assert.equal(changed.body.code,'PAYMENT_ACTIVATION_PENDING');
  assert.equal(s.deliveries.length,0);
  s.context.malviCatalogService.published = async () => { throw Error('fixture catalogue unavailable'); };
  const unavailable = await s.call(s.verify,{authId:'owner',params:{reference:init.body.reference}});
  assert.equal(unavailable.code,503);
  assert.equal(s.deliveries.length,0);
  Object.assign(s.plan,{name:'Premium',voiceInteractionMinutesLimit:80,
    videoInteractionMinutesLimit:10,priceMonthlyGHS:145});
  s.context.malviCatalogService.published = published;
  const verified = await s.call(s.verify,{authId:'owner',params:{reference:init.body.reference}});
  assert.equal(verified.code,200,JSON.stringify(verified.body));
  assert.equal(s.deliveries[0].planName,'Premium');
  assert.equal(s.deliveries[0].price,145);
  assert.equal(s.deliveries[0].voiceMinutesAllowed,80);
  assert.equal(s.deliveries[0].videoMinutesAllowed,10);
  assert.equal(s.deliveries[0].metadata.catalogVersion,1);
});

test('provider verification failures preserve the purchase and return a safe recoverable response',async()=>{
  for(const status of [401,403,400,404,429,503]){
    const s=system();
    const init=await s.call(s.initialize,{authId:'owner',body:{purpose:'MALVI_SUBSCRIPTION',planTier:'premium',amount:145}});
    const reference=init.body.reference;
    s.context.fetch=async()=>Response.json({status:false,message:'private@example.test sk_live_private'},{status});
    const result=await s.call(s.verify,{authId:'owner',params:{reference}});
    assert.equal(result.code,503);
    assert.equal(result.body.code,'PAYMENT_VERIFICATION_UNAVAILABLE');
    assert.equal(result.body.verified,false);
    assert.match(result.body.error,/Do not pay again/);
    assert.doesNotMatch(JSON.stringify(result.body),/private@example|sk_live_private/);
    assert.equal(s.deliveries.length,0);
    assert.equal(s.orders.has(reference),true);
  }
});

test('pending and failed payments are not confused with provider outages or successful verification',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{authId:'owner',body:{purpose:'MALVI_SUBSCRIPTION',planTier:'premium',amount:145}});
  const reference=init.body.reference;
  for(const status of ['pending','ongoing','failed','abandoned','reversed']){
    s.provider.get(reference).status=status;
    const result=await s.call(s.verify,{authId:'owner',params:{reference}});
    assert.equal(result.code,409);
    assert.equal(result.body.code,['failed','abandoned','reversed'].includes(status)?'PAYMENT_NOT_COMPLETED':'PAYMENT_PENDING');
    assert.equal(result.body.verified,false);
    assert.doesNotMatch(result.body.error,/Verification successful/);
    assert.equal(s.deliveries.length,0);
  }
});

test('paid Malvi activation failure is explicit and recoverable after a server restart', async () => {
  const s = system();
  const init = await s.call(s.initialize, { authId:'owner', body:{
    purpose:'MALVI_SUBSCRIPTION', amount:145, planTier:'premium',
  } });
  const reference = init.body.reference;
  s.context.pendingPaystackOrders.clear();
  s.failOnce();
  const failed = await s.call(s.verify, { authId:'owner', params:{reference} });
  assert.equal(failed.code, 503);
  assert.equal(failed.body.success, false);
  assert.equal(failed.body.verified, true);
  assert.equal(failed.body.code, 'PAYMENT_ACTIVATION_PENDING');
  assert.match(failed.body.error, /Do not pay again/);
  assert.equal(s.deliveries.length, 0);
  const recovered = await s.call(s.verify, { authId:'owner', params:{reference} });
  assert.equal(recovered.body.success, true);
  assert.equal(s.deliveries.length, 1);
  const repeated = await s.call(s.verify, { authId:'owner', params:{reference} });
  assert.equal(repeated.body.alreadyFulfilled, true);
  assert.equal(s.deliveries.length, 1);
});

test('recovery rejects unknown and other-account references without delivering value', async () => {
  const s = system();
  const init = await s.call(s.initialize, { authId:'owner', body:{
    purpose:'MALVI_SUBSCRIPTION', amount:145, planTier:'premium',
  } });
  for (const [authId, reference] of [
    ['other', init.body.reference], ['owner', 'NV-PSTK-unknown'],
  ]) {
    assert.equal((await s.call(s.verify, {authId, params:{reference}})).code, 403);
  }
  assert.equal(s.deliveries.length, 0);
});

for (const billingCycle of ['MONTHLY', 'ANNUAL']) {
  test(`actual Paystack webhook commits ${billingCycle} Malvi minutes, spendable credit and invoice together`, async () => {
    const pg = new PGlite();
    try {
      await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE nanivio_users(id TEXT PRIMARY KEY); INSERT INTO nanivio_users VALUES (\'owner\');');
      await pg.exec(readFileSync('migrations/002_billing_normalized_ledger.sql','utf8')
        .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
      await pg.exec(readFileSync('migrations/005_malvi_credit_and_usage.sql','utf8'));
      await pg.exec(readFileSync('migrations/013_malvi_live_allowances.sql','utf8'));
      await pg.exec(readFileSync('migrations/014_paystack_malvi_activation.sql','utf8'));
      await pg.exec(readFileSync('migrations/014_paystack_malvi_activation.sql','utf8'));
      const s = system();
      s.context.activateMalviSubscriptionPersistent = async (payload: any) =>
        (await pg.query<{result:any}>('SELECT nanivio_activate_paystack_malvi($1::jsonb) AS result',[JSON.stringify(payload)])).rows[0].result;
      s.context.getPersistentPayment = async (_provider: string, reference: string) =>
        (await pg.query('SELECT * FROM nanivio_payments WHERE provider_reference=$1',[reference])).rows[0];
      const init = await s.call(s.initialize,{authId:'owner',body:{
        purpose:'MALVI_SUBSCRIPTION',planTier:'premium',billingCycle,
        amount:billingCycle==='ANNUAL'?1450:145,
      }});
      assert.equal(init.code,200,JSON.stringify(init.body));
      const reference=init.body.reference;
      const event={event:'charge.success',data:s.provider.get(reference)};
      const rawBody=Buffer.from(JSON.stringify(event));
      const signature=crypto.createHmac('sha512','sk_live_fixture_only').update(rawBody).digest('hex');
      const notification=()=>s.call(s.webhook,{body:event,rawBody,headers:{'x-paystack-signature':signature}});
      if(billingCycle==='MONTHLY'){
        await pg.query(`INSERT INTO nanivio_invoices(invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status)
          VALUES($1,'fixture-conflict','owner','fixture-conflict',1,1,'GHS','PAID')`,['inv_malvi_'+reference]);
        assert.equal((await notification()).code,500,'invoice failure must roll back the whole paid grant');
        assert.equal((await pg.query('SELECT * FROM nanivio_payments')).rows.length,0);
        assert.equal((await pg.query('SELECT * FROM nanivio_malvi_subscriptions')).rows.length,0);
        assert.equal((await pg.query('SELECT * FROM malvi_credit_accounts')).rows.length,0);
        await pg.query('DELETE FROM nanivio_invoices WHERE invoice_id=$1',['inv_malvi_'+reference]);
      }
      assert.equal((await notification()).code,200);
      const subscription=(await pg.query<any>('SELECT * FROM nanivio_malvi_subscriptions')).rows[0];
      assert.equal(Number(subscription.voice_minutes_allowed),30);
      assert.equal(Number(subscription.video_minutes_allowed),30);
      assert.equal(subscription.auto_renew,false);
      const days=(new Date(subscription.current_period_end).getTime()-new Date(subscription.current_period_start).getTime())/86400000;
      assert.equal(days,billingCycle==='ANNUAL'?365:30);
      assert.equal(Number((await pg.query<any>('SELECT credit_balance FROM malvi_credit_accounts')).rows[0].credit_balance),30);
      assert.equal((await pg.query('SELECT * FROM nanivio_invoices')).rows.length,1);
      // Consume actual credit before both webhook retry and browser verification.
      await pg.exec("UPDATE malvi_credit_accounts SET credit_balance=28; UPDATE nanivio_malvi_subscriptions SET voice_minutes_used=2;");
      assert.equal((await notification()).code,200);
      assert.equal((await s.call(s.verify,{authId:'owner',params:{reference}})).code,200);
      assert.equal(Number((await pg.query<any>('SELECT credit_balance FROM malvi_credit_accounts')).rows[0].credit_balance),28);
      assert.equal((await pg.query('SELECT * FROM nanivio_payments')).rows.length,1);
      assert.equal((await pg.query('SELECT * FROM malvi_credit_ledger')).rows.length,1);
      const after=(await pg.query<any>('SELECT * FROM nanivio_malvi_subscriptions')).rows[0];
      assert.equal(Number(after.voice_minutes_used),2);
      assert.equal(String(after.current_period_end),String(subscription.current_period_end));
      // Old trial cleanup must not hide the new purchase or keep the user on
      // the exhausted three-minute trial when they actually start Malvi.
      await pg.exec(`INSERT INTO nanivio_malvi_subscriptions(
        subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,
        next_billing_at,voice_minutes_allowed,voice_minutes_used,video_minutes_allowed,video_minutes_used,updated_at,currency)
        VALUES('old_trial','owner','free','free','Trial','MONTHLY','TRIAL',now()-interval '2 days',
        now()-interval '2 days',now()+interval '1 day',now()+interval '1 day',3,3,3,3,now()+interval '1 second','GHS');
        UPDATE nanivio_malvi_runtime_policy SET live_minutes_monthly=100;`);
      await pg.query("SELECT nanivio_reserve_malvi_live('owner',$1,'voice',60)",['lease_'+reference]);
      assert.equal((await pg.query<any>('SELECT subscription_id FROM nanivio_malvi_live_leases')).rows[0].subscription_id,'malvi_'+reference);
    } finally { await pg.close(); }
  });
}

test('Malvi checkout is blocked before charging when its activation migration is missing', async () => {
  const s=system();
  s.context.activateMalviSubscriptionPersistent=async()=>{throw new Error('RPC is missing');};
  const init=await s.call(s.initialize,{authId:'owner',body:{purpose:'MALVI_SUBSCRIPTION',planTier:'premium',amount:145}});
  assert.equal(init.code,503);
  assert.equal(s.provider.size,0);
  assert.equal(s.orders.size,0);
});

test('actual Malvi wallet route rejects stale versions or prices before debiting and uses separate allowances', async () => {
  const s = system();
  s.plan.catalogVersion=2;
  s.plan.voiceInteractionMinutesLimit=80;
  s.plan.videoInteractionMinutesLimit=10;
  const request = {tier:'premium',billingCycle:'MONTHLY',currency:'GHS',paymentMethod:'NANIVIO_CREDIT',catalogVersion:1,expectedAmount:145};
  assert.equal((await s.call(s.malviWallet,{authId:'owner',body:request})).code,409);
  assert.equal(s.deliveries.length,0);
  request.catalogVersion=2;
  request.expectedAmount=144;
  assert.equal((await s.call(s.malviWallet,{authId:'owner',body:request})).code,409);
  assert.equal(s.deliveries.length,0);
  request.expectedAmount=145;
  const paid=await s.call(s.malviWallet,{authId:'owner',body:request});
  assert.equal(paid.code,200,JSON.stringify(paid.body));
  assert.equal(s.deliveries[0].videoMinutesAllowed,10);
  assert.equal(s.deliveries[0].voiceMinutesAllowed,80);
  assert.equal(s.deliveries[0].userId,'owner');
});

for (const [purpose, amount, extra] of [
  ['COMMUNICATION_TOPUP',20,{}],
  ['COMMUNICATION_MINUTES',55,{ packageId:'pack', minutes:60 }],
  ['SUBSCRIPTION',145,{ planTier:'premium' }],
  ['MALVI_SUBSCRIPTION',145,{ planTier:'premium' }],
] as const) {
  test(`actual ${purpose} handlers initialize and verify exactly one delivery with a stubbed gateway`, async()=>{
    const s=system();
    const init=await s.call(s.initialize,{ authId:'owner', body:{ purpose, amount, ...extra } });
    assert.equal(init.code,200);
    const reference=init.body.reference;
    assert.equal(s.deliveries.length,0,'Initializing checkout must not grant value');
    const verified=await s.call(s.verify,{ authId:'owner', params:{ reference } });
    assert.equal(verified.code,200,JSON.stringify(verified.body));
    assert.equal(verified.body.verified,true);
    assert.equal(s.deliveries.length,1);
    const retry=await s.call(s.verify,{ authId:'owner', params:{ reference } });
    assert.equal(retry.body.alreadyFulfilled,true);
    assert.equal(s.deliveries.length,1);
    assert.equal((await s.call(s.verify,{ authId:'other', params:{ reference } })).code,403);
  });
}

test('missing credentials and unpaid gateway statuses cannot deliver value',async()=>{
  const s=system();
  s.context.process.env={};
  assert.equal((await s.call(s.initialize,{ authId:'owner', body:{ amount:20 } })).code,503);
  assert.equal(s.provider.size,0);
  s.context.process.env={ PAYSTACK_SECRET_KEY:'sk_live_fixture_only' };
  const init=await s.call(s.initialize,{ authId:'owner', body:{ amount:20 } });
  const reference=init.body.reference;
  s.provider.get(reference).status='pending';
  assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,409);
  assert.equal(s.deliveries.length,0);
});

test('a failed signed webhook can retry and recover without duplicate value',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{ authId:'owner', body:{ amount:20 } });
  const event={ event:'charge.success', data:{ ...s.provider.get(init.body.reference), id:123 } };
  const rawBody=Buffer.from(JSON.stringify(event));
  const signature=crypto.createHmac('sha512','sk_live_fixture_only').update(rawBody).digest('hex');
  const req={ body:event, rawBody, headers:{ 'x-paystack-signature':signature } };
  s.failOnce();
  assert.equal((await s.call(s.webhook,req)).code,500);
  assert.equal(s.deliveries.length,0);
  assert.equal((await s.call(s.webhook,req)).code,200);
  assert.equal(s.deliveries.length,1);
  assert.equal((await s.call(s.webhook,req)).code,200);
  assert.equal(s.deliveries.length,1);
});

test('altered checkout requests are rejected before an order or gateway charge is created', async()=>{
  const s=system();
  for (const body of [
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:0.01 },
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55, minutes:60000 },
    { purpose:'COMMUNICATION_MINUTES', packageId:'unknown', amount:55 },
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', currency:'NGN', amount:55 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:0.01 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'premium', billingCycle:'ANNUAL', amount:145 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'premium', billingCycle:'WEEKLY', amount:145 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'premium', currency:'NGN', amount:145 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'unknown', amount:145 },
  ]) assert.equal((await s.call(s.initialize,{ authId:'owner', body })).code,400);
  s.context.billingDb.communicationMinutePackages[0].isActive=false;
  s.context.billingDb.malviPlans[0].isActive=false;
  for (const body of [
    { purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55 },
    { purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:145 },
  ]) assert.equal((await s.call(s.initialize,{ authId:'owner', body })).code,400);
  assert.equal(s.orders.size,0);
  assert.equal(s.provider.size,0);
  assert.equal(s.deliveries.length,0);
});

test('persisted checkout values and delivery ignore client snapshots and survive a server restart',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{ authId:'owner', body:{
    purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55,
    userId:'attacker', email:'attacker@example.test',
    product:{ id:'pack', minutes:999999, validityDays:999999 },
  } });
  const reference=init.body.reference;
  const saved=s.orders.get(reference);
  assert.equal(saved.userId,'owner');
  assert.equal(saved.amount,55);
  assert.equal(saved.minutes,60);
  assert.equal(saved.product.minutes,60);
  assert.equal(saved.product.validityDays,30);
  s.context.pendingPaystackOrders.clear();
  const verified=await s.call(s.verify,{ authId:'owner', params:{ reference } });
  assert.equal(verified.code,200);
  assert.equal(s.deliveries[0].minutes,60);
  assert.equal(s.deliveries[0].price,55);
  assert.equal(s.deliveries[0].validityDays,30);
});

test('test-mode credentials never open checkout or create an order', async () => {
  const s = system();
  s.context.process.env.PAYSTACK_SECRET_KEY = 'sk_test_fixture_only';
  const init = await s.call(s.initialize, { authId:'owner', body:{ amount:20 } });
  assert.equal(init.code, 503);
  assert.equal(s.orders.size, 0);
  assert.equal(s.provider.size, 0);
  assert.equal(s.deliveries.length, 0);
});

test('actual verify and signed webhook routes reject test or missing domain for both card and mobile money', async () => {
  for (const channel of ['card', 'mobile_money']) {
    for (const domain of ['test', undefined]) {
      const s = system();
      const init = await s.call(s.initialize, { authId:'owner', body:{
        purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:145,
      } });
      const reference = init.body.reference;
      Object.assign(s.provider.get(reference), { channel, domain });
      assert.equal((await s.call(s.verify, { authId:'owner', params:{ reference } })).code, 400);
      const event = { event:'charge.success', data:s.provider.get(reference) };
      const rawBody = Buffer.from(JSON.stringify(event));
      const signature = crypto.createHmac('sha512', 'sk_live_fixture_only').update(rawBody).digest('hex');
      assert.equal((await s.call(s.webhook, {
        body:event, rawBody, headers:{ 'x-paystack-signature':signature },
      })).code, 400);
      assert.equal(s.deliveries.length, 0);
    }
  }
});

test('card and mobile money pending authorizations do not activate Malvi; completed live payments do', async () => {
  for (const channel of ['card', 'mobile_money']) {
    const s = system();
    const init = await s.call(s.initialize, { authId:'owner', body:{
      purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:145,
    } });
    const reference = init.body.reference;
    Object.assign(s.provider.get(reference), { channel, status:'pending' });
    assert.equal((await s.call(s.verify, { authId:'owner', params:{ reference } })).code, 409);
    assert.equal(s.deliveries.length, 0);
    s.provider.get(reference).status = 'success';
    assert.equal((await s.call(s.verify, { authId:'owner', params:{ reference } })).body.verified, true);
    assert.equal(s.deliveries.length, 1);
  }
});

test('untrusted legacy and changed persisted order values cannot deliver even when payment matches the intent',async()=>{
  for (const change of [
    (o:any)=>{ o.amount=1; },
    (o:any)=>{ o.minutes=999999; },
    (o:any)=>{ o.product.minutes=999999; },
    (o:any)=>{ o.product.validityDays=999999; },
    (o:any)=>{ delete o.product; o.amount=1; o.minutes=999999; },
    (o:any)=>{ o.currency='NGN'; },
  ]) {
    const s=system();
    const init=await s.call(s.initialize,{ authId:'owner', body:{ purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55 } });
    const reference=init.body.reference;
    const order=s.orders.get(reference);
    change(order);
    Object.assign(s.provider.get(reference),{ amount:order.amount*100, currency:order.currency });
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,503);
    assert.equal(s.deliveries.length,0);
  }
  for (const change of [
    (o:any)=>{ o.amount=1; },
    (o:any)=>{ o.product.videoMinutesAllowed=999999; },
    (o:any)=>{ o.product.id='different-plan'; },
    (o:any)=>{ delete o.product; o.amount=1; },
    (o:any)=>{ o.billingCycle='ANNUAL'; },
    (o:any)=>{ o.billingCycle='WEEKLY'; },
    (o:any)=>{ o.currency='NGN'; },
  ]) {
    const s=system();
    const init=await s.call(s.initialize,{ authId:'owner', body:{ purpose:'MALVI_SUBSCRIPTION', planTier:'premium', amount:145 } });
    const reference=init.body.reference;
    const order=s.orders.get(reference);
    change(order);
    Object.assign(s.provider.get(reference),{ amount:order.amount*100, currency:order.currency });
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,503);
    assert.equal(s.deliveries.length,0);
  }
});

for (const purpose of ['COMMUNICATION_MINUTES','MALVI_SUBSCRIPTION']) {
  test(`${purpose} validates the live catalog before delivery but completed retries stay idempotent`,async()=>{
    const s=system();
    const init=await s.call(s.initialize,{ authId:'owner', body:{
      purpose, packageId:'pack', planTier:'premium',
    } });
    const reference=init.body.reference;
    const product=purpose==='COMMUNICATION_MINUTES'
      ? s.context.billingDb.communicationMinutePackages[0] : s.context.billingDb.malviPlans[0];
    product.isActive=false;
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,503);
    assert.equal(s.deliveries.length,0);
    product.isActive=true;
    const priceKey=purpose==='COMMUNICATION_MINUTES'?'priceGHS':'priceMonthlyGHS';
    const originalPrice=product[priceKey];
    product[priceKey]=originalPrice+1;
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,503);
    assert.equal(s.deliveries.length,0);
    product[priceKey]=originalPrice;
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,200);
    product.isActive=false;
    const retry=await s.call(s.verify,{ authId:'owner', params:{ reference } });
    assert.equal(retry.body.alreadyFulfilled,true);
    assert.equal(s.deliveries.length,1);
  });
}

test('Malvi annual USD checkout derives its price and entitlements from the catalog',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{ authId:'owner', body:{
    purpose:'MALVI_SUBSCRIPTION', planTier:'premium', billingCycle:'ANNUAL', currency:'USD',
    product:{ videoMinutesAllowed:999999 },
  } });
  const reference=init.body.reference;
  assert.equal(s.provider.get(reference).amount,9900);
  assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,200);
  assert.equal(s.deliveries[0].price,99);
  assert.equal(s.deliveries[0].billingCycle,'ANNUAL');
  assert.equal(s.deliveries[0].videoMinutesAllowed,30);
  assert.equal(s.deliveries[0].voiceMinutesAllowed,30);
});

test('delivery requires the durable order and exact provider amount/currency',async()=>{
  for (const [change, expectedStatus] of [
    [(s:any,r:string)=>s.orders.delete(r),403],
    [(s:any,r:string)=>{ s.provider.get(r).amount=1; },503],
    [(s:any,r:string)=>{ s.provider.get(r).amount=5500.4; },400],
    [(s:any,r:string)=>{ s.provider.get(r).currency='USD'; },503],
  ] as const) {
    const s=system();
    const init=await s.call(s.initialize,{ authId:'owner', body:{ purpose:'COMMUNICATION_MINUTES', packageId:'pack', amount:55 } });
    const reference=init.body.reference;
    change(s,reference);
    assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,expectedStatus);
    assert.equal(s.deliveries.length,0);
  }
});

test('a failed minute-pack webhook retries, then browser verification does not deliver again',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{ authId:'owner', body:{ purpose:'COMMUNICATION_MINUTES', packageId:'pack' } });
  const reference=init.body.reference;
  const event={ event:'charge.success', data:{ ...s.provider.get(reference), id:456 } };
  const rawBody=Buffer.from(JSON.stringify(event));
  const signature=crypto.createHmac('sha512','sk_live_fixture_only').update(rawBody).digest('hex');
  const req={ body:event, rawBody, headers:{ 'x-paystack-signature':signature } };
  s.failOnce();
  assert.equal((await s.call(s.webhook,req)).code,500);
  assert.equal(s.deliveries.length,0);
  assert.equal((await s.call(s.webhook,req)).code,200);
  const retry=await s.call(s.verify,{ authId:'owner', params:{ reference } });
  assert.equal(retry.body.alreadyFulfilled,true);
  assert.equal(s.deliveries.length,1);
});
