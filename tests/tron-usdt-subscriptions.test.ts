import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { tronAddressHex, TRON_USDT_CONTRACT, usdtAmount, verifyTronReceipt, TronReader } from '../src/server/crypto/tron.ts';

const wallet = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8'; // Public fixture, no signing key.
const tx = 'a'.repeat(64);
const amount = '9987654';
const receipt = {
  id: tx, receipt: { result: 'SUCCESS' }, blockNumber: 73880000, blockTimeStamp: Date.now(),
  log: [{
    address: tronAddressHex(TRON_USDT_CONTRACT),
    topics: ['ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0'.repeat(24) + tronAddressHex(wallet),
      '0'.repeat(24) + tronAddressHex(wallet)],
    data: BigInt(amount).toString(16).padStart(64, '0'),
  }],
};

test('official USDT contract and solidified successful transfer are required', async () => {
  assert.equal(tronAddressHex(TRON_USDT_CONTRACT).length, 40);
  assert.throws(() => tronAddressHex(TRON_USDT_CONTRACT.slice(0, -1) + 'a'), /checksum|valid/);
  assert.equal(usdtAmount(amount), '9.987654');
  assert.equal(verifyTronReceipt(receipt, tx, wallet, amount).amountUnits, amount);
  for (const mutated of [
    { ...receipt, receipt: { result: 'FAILED' } },
    { ...receipt, id: 'b'.repeat(64) },
    { ...receipt, log: [{ ...receipt.log[0], address: tronAddressHex(wallet) }] },
    { ...receipt, log: [{ ...receipt.log[0], data: BigInt(amount + '1').toString(16).padStart(64,'0') }] },
    { ...receipt, log: [{ ...receipt.log[0], topics: [...receipt.log[0].topics.slice(0, 2), '0'.repeat(64)] }] },
  ]) assert.throws(() => verifyTronReceipt(mutated, tx, wallet, amount));
  const reader = new TronReader(async (url, init) => {
    assert.match(String(url), /^https:\/\/api\.trongrid\.io\/walletsolidity\/gettransactioninfobyid$/);
    assert.equal(init?.method, 'POST');
    return new Response(JSON.stringify(receipt), { status: 200 });
  });
  assert.equal((await reader.proof(tx, wallet, amount)).transactionId, tx);
});

test('real billing SQL reserves unique discounted amounts and activates exactly once', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE nanivio_users(id TEXT PRIMARY KEY);');
    for (const name of [
      '002_billing_normalized_ledger', '005_malvi_credit_and_usage', '007_communication_plan_entitlements',
      '008_paystack_paid_subscriptions', '009_billing_malvi_expression_fix', '012_malvi_plan_catalog',
      '013_malvi_live_allowances', '014_paystack_malvi_activation', '020_malvi_business_rooms',
      '021_communication_access_policy', '022_tron_usdt_subscriptions', '023_tron_usdt_all_billing',
    ]) await db.exec(readFileSync(`migrations/${name}.sql`, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
    await db.exec("INSERT INTO nanivio_users(id) VALUES('a'),('b'),('c')");
    const command = async (name: string, payload: any) =>
      (await db.query<{ result: any }>('SELECT nanivio_tron_usdt_command($1,$2::jsonb) result',
        [name, JSON.stringify(payload)])).rows[0].result;
    assert.equal((await command('PREFLIGHT', {})).success, true);
    const communication = {
      purpose:'SUBSCRIPTION', currency:'USD', billingCycle:'MONTHLY', amount:9.99,
      planTier:'premium', product:{id:'premium',tier:'premium',name:'Communication Premium',periodDays:30,
        langpretationQuota:120,voiceQuota:60,malviQuota:0},
    };
    const create = (userId: string, purchase: Record<string, unknown> = communication) =>
      command('CREATE', {userId, receivingAddress: wallet, purchase});
    const first = (await create('a')).invoice;
    const second = (await create('b')).invoice;
    assert.notEqual(first.amount_units, second.amount_units);
    assert.ok(Number(first.amount_units) < 9990000 && Number(first.amount_units) > 9980000);
    assert.equal(first.status, 'PENDING');
    assert.equal((await command('LIST',{ userId:'b' })).invoices.length, 1);
    // Construct the fixture receipt for the uniquely quoted invoice amount.
    const verifiedReceipt = {
      ...receipt, blockTimeStamp: Date.now(),
      log: [{...receipt.log[0], data: BigInt(first.amount_units).toString(16).padStart(64,'0')}],
    };
    const actualProof = verifyTronReceipt(verifiedReceipt, tx, wallet, String(first.amount_units));
    const activated = (await command('CONFIRM', { id: first.id, proof: actualProof, actorId:'a' })).invoice;
    assert.equal(activated.status, 'ACTIVATED');
    assert.equal((await command('CONFIRM', {id:first.id,proof:actualProof,actorId:'a'})).alreadyFulfilled, true);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_payments WHERE provider=$1',['tron_usdt'])).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_subscriptions WHERE user_id=$1',['a'])).rows[0].n,1);
    assert.equal((await db.query<{currency:string}>('SELECT currency FROM nanivio_payments WHERE provider=$1',['tron_usdt'])).rows[0].currency,'USDT');
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_payments WHERE provider=$1',['paystack'])).rows[0].n,0);
    const replay = { ...actualProof, amountUnits: String(second.amount_units) };
    await assert.rejects(command('CONFIRM',{id:second.id,proof:replay,actorId:'b'}));
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_payments WHERE provider=$1',['tron_usdt'])).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_tron_receipts')).rows[0].n,1);

    const malvi = { ...communication, purpose:'MALVI_SUBSCRIPTION', amount:19.99, planTier:'malvi_premium',
      product: {id:'malvi_premium',tier:'malvi_premium',name:'Malvi Premium',periodDays:30,
        voiceMinutesAllowed:120,videoMinutesAllowed:40,catalogVersion:1,planSnapshot:{tier:'malvi_premium'}}};
    const third = (await create('c',malvi)).invoice;
    const malviReceipt = {...receipt,id:'b'.repeat(64),blockTimeStamp:Date.now(),
      log:[{...receipt.log[0],data:BigInt(third.amount_units).toString(16).padStart(64,'0')}]};
    const malviProof = verifyTronReceipt(malviReceipt,'b'.repeat(64),wallet,String(third.amount_units));
    await command('CONFIRM',{id:third.id,proof:malviProof,actorId:'c'});
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_malvi_subscriptions WHERE user_id=$1',['c'])).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM malvi_credit_ledger WHERE user_id=$1',['c'])).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_invoices WHERE transaction_reference=$1',['NV-TRON-'+third.id])).rows[0].n,1);
    // A payment after the displayed expiry is retained for human review, not
    // silently lost or automatically credited.
    const lateInvoice = (await create('a', { ...communication, amount: 12.99 })).invoice;
    await db.query("UPDATE nanivio_tron_invoices SET expires_at=now()-interval '1 second' WHERE id=$1",[lateInvoice.id]);
    const lateReceipt = { ...receipt, id:'c'.repeat(64), blockTimeStamp:Date.now(),
      log: [{ ...receipt.log[0], data:BigInt(lateInvoice.amount_units).toString(16).padStart(64,'0') }] };
    const lateProof = verifyTronReceipt(lateReceipt,'c'.repeat(64),wallet,String(lateInvoice.amount_units));
    assert.equal((await command('CONFIRM',{id:lateInvoice.id,proof:lateProof,actorId:'a'})).invoice.status,'REVIEW');
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM nanivio_payments WHERE provider='tron_usdt'")).rows[0].n,2);
    assert.equal((await command('CONFIRM',{id:lateInvoice.id,proof:lateProof,actorId:'admin',acceptLate:true})).invoice.status,'ACTIVATED');
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM nanivio_payments WHERE provider='tron_usdt'")).rows[0].n,3);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM nanivio_billing_audit_logs WHERE action='TRON_LATE_PAYMENT_APPROVED'")).rows[0].n,1);
    assert.equal((await db.query<{permitted:boolean}>("SELECT has_function_privilege('authenticated','nanivio_tron_usdt_command(text,jsonb)','EXECUTE') permitted")).rows[0].permitted,false);
    const yearly = { ...communication, amount: 99, billingCycle: 'ANNUAL',
      product: { ...communication.product, periodDays: 365 } };
    const annualInvoice = (await create('b',yearly)).invoice;
    const annualReceipt = { ...receipt, id:'d'.repeat(64), blockTimeStamp:Date.now(),
      log:[{...receipt.log[0], data:BigInt(annualInvoice.amount_units).toString(16).padStart(64,'0')}]};
    const annualProof = verifyTronReceipt(annualReceipt,'d'.repeat(64),wallet,String(annualInvoice.amount_units));
    await command('CONFIRM',{id:annualInvoice.id,proof:annualProof,actorId:'b'});
    assert.equal((await db.query<{n:number}>(`SELECT count(*)::int n FROM nanivio_subscriptions WHERE user_id='b'
      AND current_period_end > now()+interval '364 days' AND auto_renew=false`)).rows[0].n,1);
    // The expansion keeps the original verified-activation pipeline and credits
    // the owner's USD service wallet, never a cash wallet or USDT wallet.
    await db.exec("INSERT INTO nanivio_users(id) VALUES('topup-user'),('pack-user')");
    assert.deepEqual((await command('PREFLIGHT', {})).paymentPurposes,
      ['SUBSCRIPTION','MALVI_SUBSCRIPTION','COMMUNICATION_TOPUP','COMMUNICATION_MINUTES']);
    const topup = (await create('topup-user', {
      purpose:'COMMUNICATION_TOPUP', currency:'USD', billingCycle:'MONTHLY', amount:10,
      product:{id:'nanivio-usd-credit',name:'Nanivio credit top-up',creditAmountUSD:10},
    })).invoice;
    const proofFor = (invoice: any, hash: string) => ({
      ...actualProof, transactionId:hash, amountUnits:String(invoice.amount_units),
      blockTimestamp:Date.parse(invoice.created_at)+100,
    });
    const topupProof = proofFor(topup,'3'.repeat(64));
    assert.equal((await command('CONFIRM',{id:topup.id,proof:topupProof,actorId:'topup-user'})).invoice.status,'ACTIVATED');
    await command('CONFIRM',{id:topup.id,proof:topupProof,actorId:'topup-user'});
    const balance = async () => Number((await db.query<{available:string}>(
      "SELECT available FROM nanivio_wallets WHERE user_id='topup-user' AND account_type='COMMUNICATION' AND currency='USD'")).rows[0].available);
    assert.equal(await balance(),10);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM nanivio_wallet_ledger WHERE user_id='topup-user'")).rows[0].n,1);
    const pack = (await create('pack-user', {
      purpose:'COMMUNICATION_MINUTES', currency:'USD', billingCycle:'MONTHLY', amount:8.99,
      packageId:'pack-150',product:{id:'pack-150',name:'150 Communication minutes',minutes:150,validityDays:60},
    })).invoice;
    const packProof = proofFor(pack,'4'.repeat(64));
    await command('CONFIRM',{id:pack.id,proof:packProof,actorId:'pack-user'});
    await command('CONFIRM',{id:pack.id,proof:packProof,actorId:'pack-user'});
    const grant = (await db.query<{voice:string;lp:string;days:number}>(
      "SELECT voice_minutes_quota voice,langpretation_minutes_remaining lp,extract(epoch from (current_period_end-current_period_start))/86400 days FROM nanivio_subscriptions WHERE subscription_id=$1",
      [`tron_${pack.id}`])).rows[0];
    assert.equal(Number(grant.voice),150);assert.equal(Number(grant.lp),150);assert.equal(Number(grant.days),60);
    const creditPayload = {
      userId:'topup-user', requestId:'11111111-2222-4333-8444-555555555555',
      referenceId:'NV-CREDIT-test',transactionId:'tx-credit-test',subscriptionId:'credit-test',
      tier:'individual_premium',planId:'plan_individual_premium',planName:'Communication Premium',
      billingCycle:'MONTHLY',periodDays:30,price:4.99,currency:'USD',paymentMethod:'Nanivio credit',
      langpretationQuota:100,voiceQuota:100,malviQuota:0,
    };
    const buy = async (payload: any) => (await db.query<{result:any}>(
      'SELECT nanivio_buy_communication_with_credit($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result;
    const creditResult = await buy(creditPayload);
    assert.equal(creditResult.success,true);
    assert.equal(creditResult.subscription.autoRenew,false);
    assert.equal((await buy(creditPayload)).alreadyFulfilled,true);
    assert.equal(await balance(),5.01);
    await assert.rejects(buy({...creditPayload,billingCycle:'ANNUAL'}));
    assert.equal(await balance(),5.01);
    await assert.rejects(buy({...creditPayload,requestId:'21111111-2222-4333-8444-555555555555',price:100,referenceId:'too-much',transactionId:'too-much'}));
    assert.equal(await balance(),5.01);
    // Owner reruns must not duplicate a delivery or revert the original rail.
    await db.exec(readFileSync('migrations/023_tron_usdt_all_billing.sql','utf8'));
    assert.equal(await balance(),5.01);
    assert.equal((await command('PREFLIGHT', {})).paymentPurposes.length,4);
  } finally { await db.close(); }
});
