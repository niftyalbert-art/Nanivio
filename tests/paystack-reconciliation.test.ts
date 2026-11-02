import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaystackReconciler,startPaystackReconciliation} from '../src/server/paystackReconciliation.ts';
import {PAYSTACK_PURPOSES} from '../src/server/paystackOrders.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('missed webhooks are reconciled using only successful matching live payments',async()=>{
  const orders=['paid','pending','test','wrong-amount','wrong-reference'].map(reference=>({
    reference,userId:'owner',purpose:'MALVI_SUBSCRIPTION',amount:58.24,currency:'GHS',
  }));
  const fulfilled:string[]=[],checked:string[]=[],errors:string[]=[];
  const run=createPaystackReconciler({
    list:async()=>orders,
    verify:async(reference)=>({reference:reference==='wrong-reference'?'different':reference,
      status:reference==='pending'?'pending':'success',domain:reference==='test'?'test':'live',
      amount:reference==='wrong-amount'?1:5824,currency:'GHS'}),
    fulfil:async(order)=>{fulfilled.push(order.reference);},
    checked:async(ref)=>{checked.push(ref);},report:ref=>{errors.push(ref);},
  });
  await run();
  assert.deepEqual(fulfilled,['paid']);
  assert.equal(checked.length,5);
  assert.equal(errors.length,3);
});

test('reconciliation does not overlap and continues after one activation error',async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let batches=0,delivered=0;
  const run=createPaystackReconciler({
    list:async()=>{batches++;await gate;return ['a','b'].map(reference=>({
      reference,userId:'owner',purpose:'MALVI_SUBSCRIPTION',amount:10,currency:'GHS',
    }));},
    verify:async(reference)=>({reference,status:'success',domain:'live',amount:1000,currency:'GHS'}),
    fulfil:async(order)=>{if(order.reference==='a')throw new Error('database unavailable');delivered++;},
    checked:async()=>{},report:()=>{},
  });
  const first=run();await run();release();await first;
  assert.equal(batches,1);assert.equal(delivered,1);
});

test('preview and test keys cannot start financial background writes',()=>{
  let runs=0;
  for(const [environment,key] of [['development','sk_live_fixture'],['production','sk_test_fixture'],['production',undefined]]){
    const stop=startPaystackReconciliation(async()=>{runs++;},environment,key);stop();
  }
  assert.equal(runs,0);
});
test('missed-checkout recovery covers every supported billing purpose, never an invented product', async () => {
  const fulfilled: string[] = [], verified: string[] = [];
  const orders = [...PAYSTACK_PURPOSES, 'INVENTED'].map(purpose => ({
    purpose, reference: purpose, userId: 'fixture-owner', amount: 10, currency: 'GHS',
  }));
  const run = createPaystackReconciler({
    list: async () => orders,
    verify: async reference => { verified.push(reference); return { reference, status: 'success', domain: 'live', amount: 1000, currency: 'GHS' }; },
    fulfil: async order => { fulfilled.push(order.purpose); },
    checked: async () => {}, report: () => assert.fail('supported matching payments must recover'),
  });
  await run();
  assert.deepEqual(fulfilled, [...PAYSTACK_PURPOSES]);
  assert.deepEqual(verified, [...PAYSTACK_PURPOSES]);
});
test('the actual pending-order query includes all billing types and remains bounded and account-authoritative', async () => {
  const source = readFileSync('src/server/billingPersistence.ts', 'utf8');
  const ast = ts.createSourceFile('billingPersistence.ts', source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'listPendingPaystackOrders')!;
  assert.ok(node);
  const calls: [string, unknown[]][] = [];
  const query: any = {};
  for (const method of ['from', 'select', 'eq', 'in', 'gte', 'lt', 'order']) {
    query[method] = (...args: unknown[]) => { calls.push([method, args]); return query; };
  }
  query.limit = async (n: number) => {
    calls.push(['limit', [n]]);
    return { data: [{ reference: 'saved-reference', user_id: 'actual-owner',
      payload: { userId: 'untrusted-payload-owner', reference: 'untrusted-reference', purpose: 'COMMUNICATION_TOPUP', amount: 20, currency: 'GHS' } }], error: null };
  };
  const context: any = { getDb: () => query, Date };
  vm.runInNewContext(ts.transpile(`${node.getText(ast).replace(/^export\s+/, '')};globalThis.run=listPendingPaystackOrders;`,
    { target: ts.ScriptTarget.ES2022 }), context);
  const orders = await context.run();
  assert.deepEqual(Array.from(calls.find(([method]) => method === 'in')![1][1] as string[]), [...PAYSTACK_PURPOSES]);
  assert.ok(calls.some(([method, args]) => method === 'eq' && args[0] === 'status' && args[1] === 'PENDING'));
  assert.ok(calls.some(([method, args]) => method === 'limit' && args[0] === 10));
  assert.ok(calls.some(([method]) => method === 'gte') && calls.some(([method]) => method === 'lt'));
  assert.equal(orders[0].userId, 'actual-owner');
  assert.equal(orders[0].reference, 'saved-reference');
});
