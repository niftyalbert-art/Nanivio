import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pricingPurchaseSnapshot, BALANCED_PLANS, BALANCED_PACKS } from '../src/lib/subscriptionPricing.ts';
import { balancedCommunicationPlans, balancedMalviPlans, balancedPacks } from '../src/lib/balancedCatalogue.ts';
import { quotePaystackOrder } from '../src/server/paystackOrders.ts';
import { billingDb } from '../src/server/billingDb.ts';
import { buildCommunicationMeter } from '../src/server/langpretationMeter.ts';

test('new catalogue replaces old offers and snapshots all seven plans and ten packs', () => {
  const plans = balancedCommunicationPlans(billingDb.subscriptionPlans, {
    plans: [{id:'plan_individual_premium',priceMonthlyUSD:9.99,includedVoiceMinutes:500}],
  });
  assert.equal(plans.length,4);
  assert.equal(plans.find(p => p.tier==='individual_premium').priceMonthlyUSD,14.99);
  const malvi = balancedMalviPlans([
    ...billingDb.malviPlans,
    {...billingDb.malviPlans[1],id:'malvi_voice',tier:'malvi_voice',status:'DRAFT'},
  ]);
  const catalogue = {
    subscriptionPlans: plans.map(p=>({...p,priceMonthlyGHS:p.priceMonthlyUSD*10,priceAnnualGHS:p.priceAnnualUSD*10})),
    malviPlans: malvi.map(p=>({...p,catalogVersion:1,priceMonthlyGHS:p.priceMonthlyUSD*10,priceAnnualGHS:p.priceAnnualUSD*10})),
    communicationMinutePackages: balancedPacks(10),
  };
  for (const plan of BALANCED_PLANS) for (const billingCycle of ['MONTHLY','ANNUAL']) {
    const purpose = plan.family==='malvi'?'MALVI_SUBSCRIPTION':'SUBSCRIPTION';
    const quote=quotePaystackOrder({purpose,planTier:plan.tier,billingCycle,currency:'USD',catalogVersion:1},catalogue);
    assert.equal(quote.amount,(billingCycle==='ANNUAL'?plan.annualCents:plan.monthlyCents)/100);
    assert.equal(quote.product.billingTerms.allocations,billingCycle==='ANNUAL'?12:1);
    assert.deepEqual(quote.product.planSnapshot.billingTerms,quote.product.billingTerms);
  }
  for (const pack of BALANCED_PACKS) {
    const quote=quotePaystackOrder({purpose:'COMMUNICATION_MINUTES',packageId:pack.id,currency:'USD'},catalogue);
    assert.equal(quote.amount,pack.priceCents/100);
    assert.deepEqual(quote.product.billingTerms.limits,pack.limits);
  }
  assert.throws(()=>quotePaystackOrder({purpose:'COMMUNICATION_MINUTES',packageId:'comm_pkg_60'},catalogue));
  assert.throws(()=>balancedPacks(0));
});

test('real payment and usage SQL cuts over without rewriting legacy purchases', async t => {
  const db=new PGlite();
  const rpc=async(name:string,args:any[]) => (await db.query<any>(
    `SELECT ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,
    args.map(a=>typeof a==='object'?JSON.stringify(a):a))).rows[0].result;
  const usage=(action:string,payload:any={})=>rpc('nanivio_balanced_usage',[action,payload]);
  const comm=(action:string,payload:any={})=>rpc('nanivio_communication_access',[action,payload]);
  const activate=async(userId:string,productId:string,method='PAYSTACK',cycle:'MONTHLY'|'ANNUAL'='MONTHLY')=>{
    const s=pricingPurchaseSnapshot(productId,cycle);
    const malvi=s.family==='malvi';
    const payload={
      userId,referenceId:`${method}_${userId}`,transactionId:`tx_${method}_${userId}`,subscriptionId:`sub_${userId}`,
      planId:productId,tier:BALANCED_PLANS.find(p=>p.id===productId)!.tier,planName:s.productName,
      billingCycle:cycle,periodDays:cycle==='ANNUAL'?365:30,price:s.priceCentsUSD/100,currency:method==='TRON'?'USDT':'USD',
      paymentMethod:method,langpretationQuota:s.limits.translationUnits/80000,voiceQuota:s.limits.callSeconds/60,malviQuota:0,
      videoMinutesAllowed:s.limits.avatarSeconds/60,voiceMinutesAllowed:s.limits.voiceSeconds/60,
      metadata:{billingTerms:s,planSnapshot:{capabilities:[],billingTerms:s}},
    };
    if(method==='CREDIT') {
      await db.query(`INSERT INTO nanivio_wallets(user_id,account_type,currency,available) VALUES($1,'COMMUNICATION','USD',1000)`,[userId]);
      return rpc('nanivio_billing_command',[malvi?'MALVI_SUBSCRIPTION_FROM_WALLET':'SUBSCRIPTION_FROM_WALLET',payload]);
    }
    const fn=method==='TRON'?(malvi?'nanivio_activate_tron_usdt_malvi':'nanivio_activate_tron_usdt_subscription'):
      (malvi?'nanivio_activate_paystack_malvi':'nanivio_activate_paystack_subscription');
    return rpc(fn,[payload]);
  };
  const buyPack=(userId:string,id:string,method='PAYSTACK')=>{
    const snapshot=pricingPurchaseSnapshot(id);
    return rpc('nanivio_fulfill_balanced_pack',[{userId,referenceId:`pack_${userId}_${id}`,transactionId:`tx_pack_${userId}_${id}`,
      billingTerms:snapshot,price:snapshot.priceCentsUSD/100,currency:method==='TRON'?'USDT':'USD',method}]);
  };
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE nanivio_users(id TEXT PRIMARY KEY);');
    const migrations=[
      '002_billing_normalized_ledger','005_malvi_credit_and_usage','007_communication_plan_entitlements',
      '008_paystack_paid_subscriptions','009_billing_malvi_expression_fix','012_malvi_plan_catalog',
      '013_malvi_live_allowances','014_paystack_malvi_activation','020_malvi_business_rooms',
      '021_communication_access_policy','022_tron_usdt_subscriptions','023_tron_usdt_all_billing',
      '024_balanced_pricing_ledger',
    ];
    for(const name of migrations) await db.exec((await readFile(`migrations/${name}.sql`,'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
    await db.exec(`INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,
      started_at,current_period_start,current_period_end,next_billing_at,currency,price_paid,
      voice_minutes_quota,voice_minutes_used,langpretation_minutes_quota,langpretation_minutes_remaining)
      VALUES('legacy','legacy','old','individual_premium','Original plan','ANNUAL','ACTIVE',
      now(),now(),now()+interval '10 months',now()+interval '10 months','USD',99,500,17,200,183);`);
    const old=(await db.query("SELECT * FROM nanivio_subscriptions WHERE subscription_id='legacy'")).rows;
    const rollout=await readFile('migrations/025_balanced_billing_rollout.sql','utf8');
    await db.exec(rollout); await db.exec(rollout);
    await t.test('installation is repeatable, private and leaves paid legacy benefits unchanged',async()=>{
      assert.deepEqual((await db.query("SELECT * FROM nanivio_subscriptions WHERE subscription_id='legacy'")).rows,old);
      assert.equal((await rpc('nanivio_balanced_billing_ready',[])).ready,true);
      assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_balanced_terms')).rows[0].n,0);
      assert.equal((await db.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated','nanivio_fulfill_balanced_pack(jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
      assert.equal((await db.query<{allowed:boolean}>("SELECT has_function_privilege('service_role','nanivio_billing_command_pre_balanced(text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    });
    await t.test('all three rails activate new communication and Malvi terms atomically',async()=>{
      for(const method of ['PAYSTACK','TRON','CREDIT']) for(const id of ['plan_individual_premium','malvi_basic']) {
        const uid=`${method}_${id}`;
        await db.query('INSERT INTO nanivio_users VALUES($1)',[uid]);
        assert.equal((await activate(uid,id,method)).success,true);
        const term=(await db.query<any>('SELECT * FROM nanivio_balanced_terms WHERE user_id=$1',[uid])).rows[0];
        assert.equal(term.snapshot.pricingVersion,'balanced-2026-11');
        assert.equal(term.snapshot.priceCentsUSD,id.startsWith('malvi')?999:1499);
        if(id.startsWith('malvi')) {
          assert.equal(Number((await db.query<any>('SELECT credit_balance FROM malvi_credit_accounts WHERE user_id=$1',[uid])).rows[0].credit_balance),35);
          assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM malvi_credit_ledger WHERE user_id=$1 AND reference LIKE 'malvi_entitlement_%'",[uid])).rows[0].n,1);
        } else assert.equal((await comm('ACCESS',{userId:uid})).textCharactersRemaining,20000);
      }
    });
    await t.test('annual allocation resets only elapsed months, never grants the annual quota upfront',async()=>{
      await db.exec("INSERT INTO nanivio_users VALUES('annual');");
      await activate('annual','plan_individual_premium','PAYSTACK','ANNUAL');
      await db.exec(`UPDATE nanivio_balanced_terms SET started_at=now()-interval '2 months',allocation_ends_at=now()-interval '1 month',
        expires_at=now()+interval '10 months' WHERE user_id='annual';
        UPDATE nanivio_pricing_grants SET started_at=now()-interval '2 months' WHERE user_id='annual';
        UPDATE nanivio_subscriptions SET voice_minutes_used=199,langpretation_minutes_used=20,langpretation_minutes_remaining=0 WHERE user_id='annual';`);
      await rpc('nanivio_refresh_balanced_terms',['annual']);
      const row=(await db.query<any>("SELECT voice_minutes_quota,voice_minutes_used,langpretation_minutes_remaining FROM nanivio_subscriptions WHERE user_id='annual'")).rows[0];
      assert.equal(Number(row.voice_minutes_quota),200);
      assert.equal(Number(row.voice_minutes_used),0);
      assert.equal(Number(row.langpretation_minutes_remaining),20);
      assert.equal((await db.query<any>("SELECT allocation FROM nanivio_balanced_terms WHERE user_id='annual'")).rows[0].allocation,2);
    });
    await t.test('text requests and characters are separate limits, cancelled work refunds both',async()=>{
      const uid='PAYSTACK_plan_individual_premium';
      await db.exec(`UPDATE nanivio_pricing_grants SET snapshot=jsonb_set(snapshot,'{limits,textRequests}','1') WHERE user_id='${uid}';`);
      assert.equal((await comm('RESERVE',{userId:uid,eventId:'text_one',resource:'text',amount:10})).success,true);
      assert.equal((await comm('RESERVE',{userId:uid,eventId:'text_two',resource:'text',amount:1})).success,false);
      await comm('RELEASE',{userId:uid,eventId:'text_one'});
      assert.equal((await comm('RESERVE',{userId:uid,eventId:'text_three',resource:'text',amount:10})).success,true);
      await comm('COMMIT',{userId:uid,eventId:'text_three',used:10});
      assert.equal((await comm('ACCESS',{userId:uid})).textCharactersRemaining,19990);
      assert.equal((await comm('RESERVE',{userId:uid,eventId:'text_four',resource:'text',amount:1})).success,false);
    });
    await t.test('all ten packs grant only their own resource, are idempotent and do not replace a subscription',async()=>{
      for(const pack of BALANCED_PACKS) {
        const uid=`buyer_${pack.id}`;
        const first=await buyPack(uid,pack.id);
        assert.equal(first.success,true);
        assert.equal((await buyPack(uid,pack.id)).alreadyFulfilled,true);
        assert.deepEqual((await usage('ACCESS',{userId:uid})).remaining,pack.limits);
        assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM nanivio_subscriptions WHERE user_id=$1',[uid])).rows[0].n,0);
      }
    });
    await t.test('calls, speech translation and text can consume funded add-ons without a paid base subscription',async()=>{
      const policy=(await comm('POLICY')).config;
      await comm('SAVE_POLICY',{config:{...policy,callTrialDays:0,liveTrialMinutes:0}});
      for(const [uid,kind,quantity,leftKey,leftValue] of [
        ['buyer_call_100','call',5,'callSeconds',5998],
        ['buyer_lang_10','note',2,'translationUnits',800000-Math.ceil(2*80000/60)],
        ['buyer_text_300','text',12,'textCharacters',19988],
      ] as const) {
        assert.equal((await comm('RESERVE',{userId:uid,resource:kind,amount:quantity,eventId:`use_${kind}`})).success,true);
        await comm('COMMIT',{userId:uid,eventId:`use_${kind}`,used:kind==='call'?2:quantity});
        assert.equal((await usage('ACCESS',{userId:uid})).remaining[leftKey],leftValue);
      }
      assert.equal((await usage('ACCESS',{userId:'buyer_text_300'})).remaining.textRequests,299);
      const access=await comm('ACCESS',{userId:'buyer_lang_10'});
      const meter=buildCommunicationMeter('buyer_lang_10',access,null);
      assert.equal(meter.monthlyQuota,10);
      assert.ok(meter.remainingAllowance<10 && meter.remainingAllowance>9);
      assert.ok(meter.minutesUsed>0);
    });
    await t.test('insufficient credit does not create a grant, receipt, payment or partial wallet debit',async()=>{
      await assert.rejects(()=>buyPack('unfunded','call_100','CREDIT'),/Insufficient/);
      assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM nanivio_pricing_grants WHERE user_id='unfunded'")).rows[0].n,0);
    });
    await t.test('Malvi avatar add-ons escrow and refund only avatar time, never the voice allowance',async()=>{
      const uid='PAYSTACK_malvi_basic';
      await buyPack(uid,'malvi_avatar_10');
      await db.exec(`UPDATE nanivio_malvi_runtime_policy SET live_minutes_monthly=10000 WHERE id=true;
        UPDATE nanivio_malvi_subscriptions SET video_minutes_used=video_minutes_allowed WHERE user_id='${uid}';
        UPDATE malvi_credit_accounts SET credit_balance=20 WHERE user_id='${uid}';`);
      const first=await rpc('nanivio_reserve_malvi_live',[uid,'pack_avatar_cancel','avatar',60]);
      assert.equal(first.success,true);
      assert.equal((await usage('ACCESS',{userId:uid})).remaining.avatarSeconds,540);
      await rpc('nanivio_finish_malvi_live',['pack_avatar_cancel',true,false]);
      await rpc('nanivio_finish_malvi_live',['pack_avatar_cancel',true,false]);
      assert.equal((await usage('ACCESS',{userId:uid})).remaining.avatarSeconds,600);
      const sub=(await db.query<any>('SELECT voice_minutes_used,video_minutes_used,video_minutes_allowed FROM nanivio_malvi_subscriptions WHERE user_id=$1',[uid])).rows[0];
      assert.equal(Number(sub.voice_minutes_used),0);
      assert.equal(Number(sub.video_minutes_allowed),15);
      assert.equal(Number(sub.video_minutes_used),15);
      assert.equal(Number((await db.query<any>('SELECT credit_balance FROM malvi_credit_accounts WHERE user_id=$1',[uid])).rows[0].credit_balance),20);
      await rpc('nanivio_reserve_malvi_live',[uid,'pack_avatar_spoken','avatar',60]);
      await db.exec("UPDATE nanivio_malvi_live_leases SET started_at=clock_timestamp()-interval '2 seconds' WHERE lease_id='pack_avatar_spoken';");
      const finished=await rpc('nanivio_finish_malvi_live',['pack_avatar_spoken',false,false]);
      assert.ok(finished.chargedSeconds>=2 && finished.chargedSeconds<10);
      assert.equal((await usage('ACCESS',{userId:uid})).remaining.avatarSeconds,600-finished.chargedSeconds);
      assert.equal(Number((await db.query<any>('SELECT video_minutes_used FROM nanivio_malvi_subscriptions WHERE user_id=$1',[uid])).rows[0].video_minutes_used),15);
      assert.equal(Number((await db.query<any>('SELECT credit_balance FROM malvi_credit_accounts WHERE user_id=$1',[uid])).rows[0].credit_balance),20);
    });
    await t.test('plan enforcement installs after the real rollout and preserves legacy paid terms',async()=>{
      const enforcement=await readFile('migrations/026_plan_enforcement.sql','utf8');
      await db.exec(enforcement);await db.exec(enforcement);
      const storage=await rpc('nanivio_plan_storage',['ACCESS',{userId:'legacy'}]);
      assert.equal(storage.legacyPaidTerm,true);
      assert.equal(storage.capacityBytes,null);
      assert.equal((await rpc('nanivio_paid_search',['ACCESS',{userId:'legacy'}])).legacy,true);
      assert.deepEqual((await db.query("SELECT * FROM nanivio_subscriptions WHERE subscription_id='legacy'")).rows,old);
      assert.equal((await db.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated','nanivio_plan_storage(text,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
    });
  } finally {await db.close();}
});
