import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { quotePaystackOrder, validateVerifiedOrder } from '../src/server/paystackOrders.ts';
import { assertLivePaystackPayment, paystackLiveConfigurationError } from '../src/server/paystackPaymentSafety.ts';
import {verifyPaystackTransaction,paystackVerificationDiagnostic} from '../src/server/paystackVerification.ts';

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
  const deliveries: any[] = [];
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
    Buffer, crypto, AbortSignal, quotePaystackOrder, validateVerifiedOrder,
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
    markPaystackOrderFulfilled:async()=>{},
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
  context.verifyPaystackTransaction=(reference:string,key:string)=>verifyPaystackTransaction(reference,key,{fetcher:context.fetch});
  context.paystackVerificationDiagnostic=paystackVerificationDiagnostic;
  const sandbox = vm.createContext(context);
  const compile = (text: string) => {
    vm.runInContext(ts.transpile(`globalThis.result = ${text}`, { target:ts.ScriptTarget.ES2022 }), sandbox);
    return context.result;
  };
  context.fulfillPaystackOrder = compile(fulfill.getText(ast));
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
  return { context, plan, orders, deliveries, provider, initialize, verify, webhook, malviWallet, call,
    failOnce:()=>{ failNextDelivery=true; } };
}

test('Malvi fulfilment honours purchased voice/video/name/price snapshots after catalogue edits or outages', async () => {
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
  s.context.malviCatalogService.published = async () => { throw Error('fixture catalogue unavailable'); };
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
