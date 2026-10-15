import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { quotePaystackOrder, validateVerifiedOrder } from '../src/server/paystackOrders.ts';

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
    includedLangpretationMinutes:200, includedVoiceMinutes:500, videoInteractionMinutesLimit:30 };
  const deliver = async (payload: any) => {
    if (failNextDelivery) { failNextDelivery = false; throw new Error('Temporary ledger outage'); }
    if (!payments.has(payload.referenceId)) {
      deliveries.push(payload);
      payments.set(payload.referenceId, { user_id:payload.userId });
    }
    return { success:true, subscription:{ planName:'Premium', videoMinutesAllowed:30 }, balanceAfter:payload.amount };
  };
  const context: any = {
    Buffer, crypto, AbortSignal, quotePaystackOrder, validateVerifiedOrder,
    process:{ env:{ PAYSTACK_SECRET_KEY:'sk_test_fixture_only' } },
    authenticatedUserId:(req: any)=>req.authId,
    persistentAuth:{ findById:async()=>({ email:'fixture@example.test' }) },
    normalizedBillingEnabled:()=>true,
    billingDb:{ subscriptionPlans:[plan], malviPlans:[plan],
      communicationMinutePackages:[{ id:'pack', minutes:60, priceGHS:55, priceUSD:3.99, validityDays:30 }] },
    pendingPaystackOrders:new Map(),
    savePaystackOrder:async(ref: string,_user: string,order: any)=>orders.set(ref,order),
    getPaystackOrder:async(ref: string)=>orders.get(ref),
    markPaystackOrderFulfilled:async()=>{},
    getPersistentPayment:async(_provider: string,ref: string)=>payments.get(ref),
    activatePaystackSubscriptionPersistent:async(p: any)=>p.preflight?{ success:true, ready:true }:deliver(p),
    purchaseCommunicationMinutesPersistent:deliver,
    activateMalviSubscriptionPersistent:deliver,
    paystackTopUpPersistent:deliver,
    fetch:async(url: string,init: any)=>{
      if (url.endsWith('/initialize')) {
        const request = JSON.parse(init.body);
        provider.set(request.reference, { ...request, status:'success' });
        assert.equal(request.email,'fixture@example.test');
        return { ok:true, json:async()=>({ status:true, data:{
          authorization_url:'https://checkout.paystack.com/fixture', access_code:'fixture',
          reference:request.reference,
        } }) };
      }
      return { ok:true, json:async()=>({ status:true, data:provider.get(decodeURIComponent(url.split('/').at(-1)!)) }) };
    },
  };
  const sandbox = vm.createContext(context);
  const compile = (text: string) => {
    vm.runInContext(ts.transpile(`globalThis.result = ${text}`, { target:ts.ScriptTarget.ES2022 }), sandbox);
    return context.result;
  };
  context.fulfillPaystackOrder = compile(fulfill.getText(ast));
  const initialize = compile(handlerText('/api/paystack/initialize'));
  const verify = compile(handlerText('/api/paystack/verify/:reference'));
  const webhook = compile(handlerText('/api/paystack/webhook'));
  async function call(handler: any,req: any) {
    const res: any = { code:200, body:null, status(code: number){ this.code=code; return this; },
      json(body: any){ this.body=body; return this; }, send(body: any){ this.body=body; return this; } };
    await handler(req,res);
    return res;
  }
  return { context, orders, deliveries, provider, initialize, verify, webhook, call,
    failOnce:()=>{ failNextDelivery=true; } };
}

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
  s.context.process.env={ PAYSTACK_SECRET_KEY:'sk_test_fixture_only' };
  const init=await s.call(s.initialize,{ authId:'owner', body:{ amount:20 } });
  const reference=init.body.reference;
  s.provider.get(reference).status='pending';
  assert.equal((await s.call(s.verify,{ authId:'owner', params:{ reference } })).code,400);
  assert.equal(s.deliveries.length,0);
});

test('a failed signed webhook can retry and recover without duplicate value',async()=>{
  const s=system();
  const init=await s.call(s.initialize,{ authId:'owner', body:{ amount:20 } });
  const event={ event:'charge.success', data:{ ...s.provider.get(init.body.reference), id:123 } };
  const rawBody=Buffer.from(JSON.stringify(event));
  const signature=crypto.createHmac('sha512','sk_test_fixture_only').update(rawBody).digest('hex');
  const req={ body:event, rawBody, headers:{ 'x-paystack-signature':signature } };
  s.failOnce();
  assert.equal((await s.call(s.webhook,req)).code,500);
  assert.equal(s.deliveries.length,0);
  assert.equal((await s.call(s.webhook,req)).code,200);
  assert.equal(s.deliveries.length,1);
  assert.equal((await s.call(s.webhook,req)).code,200);
  assert.equal(s.deliveries.length,1);
});
