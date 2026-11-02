import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const available = ['initdb','pg_ctl','psql'].every(bin =>
  (()=>{try {execFileSync('bash',['-lc',`command -v ${bin}`],{stdio:'ignore'});return true;}catch{return false;}})());

test('admin minutes are atomic, authorized and preserve subscription terms (isolated PostgreSQL)', {skip:!available}, async t => {
  const root=mkdtempSync(join(tmpdir(),'nanivio-admin-pg-'));
  const data=join(root,'data');
  const args=['-h',root,'-p','55439','-U','fixture','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1'];
  const sql=query=>execFileSync('psql',[...args,'-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const table=(file,name)=>{
    const text=readFileSync(file,'utf8');
    const statement=text.match(new RegExp(`CREATE TABLE IF NOT EXISTS (?:public\\.)?${name} \\([\\s\\S]*?\\n\\);`));
    assert.ok(statement,`real schema for ${name}`);
    return statement[0];
  };
  const call=(id,user='voice',direction='CREDIT',minutes=10,cycle='MONTHLY',mode='voice',actor='admin',plan=true)=>
    `SELECT nanivio_admin_adjust_malvi_minutes('${actor}','00000000-0000-4000-8000-${String(id).padStart(12,'0')}',
      '${user}','${direction}','${mode}',${minutes},'${cycle}','Verified support adjustment',
      ${plan?`'{"id":"voice-plan","tier":"malvi_voice","name":"Malvi Voice"}'::jsonb`:'NULL'});`;
  let running=false;
  try {
    execFileSync('initdb',['-D',data,'-U','fixture','--auth=trust','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
    execFileSync('pg_ctl',['-D',data,'-l',join(root,'server.log'),'-o',`-F -c listen_addresses='' -k ${root} -p 55439`,'-w','start'],{stdio:'ignore'});
    running=true;
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE TABLE nanivio_users(id TEXT PRIMARY KEY,role TEXT NOT NULL,status TEXT NOT NULL);
      INSERT INTO nanivio_users SELECT id,CASE WHEN id='admin' THEN 'ADMIN' ELSE 'USER' END,'ACTIVE'
        FROM unnest(ARRAY['admin','voice','annual','paid','trial','expired','new']) id;`);
    sql(table('migrations/002_billing_normalized_ledger.sql','nanivio_subscriptions'));
    sql(table('migrations/002_billing_normalized_ledger.sql','nanivio_malvi_subscriptions'));
    sql(table('migrations/005_malvi_credit_and_usage.sql','malvi_credit_accounts'));
    sql(table('migrations/005_malvi_credit_and_usage.sql','malvi_credit_ledger'));
    sql(readFileSync('migrations/017_admin_malvi_minutes.sql','utf8'));

    await t.test('ordinary and suspended users cannot adjust; public roles cannot execute',()=>{
      assert.throws(()=>sql(call(1,'voice','CREDIT',10,'MONTHLY','voice','paid')),/ADMIN_REQUIRED/);
      sql("UPDATE nanivio_users SET status='SUSPENDED' WHERE id='admin'");
      assert.throws(()=>sql(call(1)),/ADMIN_REQUIRED/);
      sql("UPDATE nanivio_users SET status='ACTIVE' WHERE id='admin'");
      assert.throws(()=>sql(`SET ROLE authenticated;${call(1)}`),/permission denied/);
      assert.throws(()=>sql(`SET ROLE anon;SELECT nanivio_admin_malvi_overview('admin');`),/permission denied/);
    });
    await t.test('first grant requires a published server-supplied plan',()=>{
      assert.throws(()=>sql(call(1,'new','CREDIT',10,'MONTHLY','voice','admin',false)),/PUBLISHED_PLAN_REQUIRED/);
      assert.equal(sql("SELECT COUNT(*) FROM malvi_credit_accounts WHERE user_id='new'"),'0');
    });
    await t.test('monthly and annual credits create explicit non-renewing grants',()=>{
      sql(call(1));sql(call(2,'annual','CREDIT',40,'ANNUAL'));
      assert.equal(Number(sql("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='voice'")),10);
      assert.equal(sql("SELECT auto_renew FROM nanivio_malvi_subscriptions WHERE user_id='voice'"),'f');
      assert.ok(Number(sql("SELECT EXTRACT(epoch FROM(current_period_end-current_period_start))/86400 FROM nanivio_malvi_subscriptions WHERE user_id='annual'"))>=365);
    });
    const oldEnd=sql("SELECT current_period_end FROM nanivio_malvi_subscriptions WHERE user_id='voice'");
    await t.test('retries cannot double-credit or reuse an ID for another operation',()=>{
      sql(call(1));
      assert.equal(Number(sql("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='voice'")),10);
      assert.throws(()=>sql(call(1,'voice','CREDIT',11)),/ADJUSTMENT_CONFLICT/);
      assert.throws(()=>sql(call(1,'annual','CREDIT',10,'ANNUAL')),/ADJUSTMENT_CONFLICT/);
    });
    await t.test('concurrent identical requests credit only once',async()=>{
      await Promise.all([1,2].map(()=>promisify(execFile)('psql',[...args,'-c',call(3,'voice','CREDIT',5)])));
      assert.equal(Number(sql("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='voice'")),15);
      assert.equal(sql("SELECT COUNT(*) FROM malvi_credit_ledger WHERE reference='admin_malvi_00000000-0000-4000-8000-000000000003'"),'1');
    });
    await t.test('cycle changes and avatar grants to a voice-only plan roll back',()=>{
      assert.throws(()=>sql(call(4,'voice','CREDIT',20,'ANNUAL')),/MALVI_CYCLE_MISMATCH/);
      assert.throws(()=>sql(call(5,'voice','CREDIT',20,'MONTHLY','avatar')),/MALVI_AVATAR_NOT_INCLUDED/);
      assert.equal(sql("SELECT current_period_end FROM nanivio_malvi_subscriptions WHERE user_id='voice'"),oldEnd);
    });
    await t.test('debits cannot remove used/reserved minutes; failed debits change nothing',()=>{
      // Represent a real live reservation: quota and wallet already exclude its escrow.
      sql("UPDATE nanivio_malvi_subscriptions SET voice_minutes_used=10 WHERE user_id='voice';UPDATE malvi_credit_accounts SET credit_balance=5 WHERE user_id='voice'");
      assert.throws(()=>sql(call(6,'voice','DEBIT',6)),/MALVI_INSUFFICIENT_UNUSED_MINUTES/);
      assert.equal(Number(sql("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='voice'")),5);
      sql(call(7,'voice','DEBIT',5));
      assert.equal(Number(sql("SELECT voice_minutes_allowed FROM nanivio_malvi_subscriptions WHERE user_id='voice'")),10);
      assert.equal(Number(sql("SELECT voice_minutes_used FROM nanivio_malvi_subscriptions WHERE user_id='voice'")),10);
      assert.equal(sql("SELECT current_period_end FROM nanivio_malvi_subscriptions WHERE user_id='voice'"),oldEnd);
      assert.equal(sql("SELECT metadata->'operation'->>'actor' FROM malvi_credit_ledger WHERE direction='DEBIT'"),'admin');
    });
    await t.test('overview counts distinct paid accounts across services, excludes expired purchases',()=>{
      sql(`INSERT INTO nanivio_malvi_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,
        started_at,current_period_start,current_period_end,next_billing_at,price_paid,currency)
        SELECT id,uid,'p','malvi_basic','Basic','MONTHLY',status,now(),now()-interval '1 day',ends,ends,price,'USD'
        FROM (VALUES('paid-a','paid','ACTIVE',now()+interval '1 month',5),
          ('paid-b','paid','ACTIVE',now()+interval '1 month',5),
          ('trial-a','trial','TRIAL',now()+interval '1 day',0),
          ('expired-a','expired','ACTIVE',now()-interval '1 hour',5)) v(id,uid,status,ends,price);
        INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,
          started_at,current_period_start,current_period_end,price_paid,currency)
        VALUES('communication-paid','paid','p','premium','Premium','MONTHLY','ACTIVE',now(),now(),now()+interval '1 month',9,'USD');`);
      assert.deepEqual(JSON.parse(sql("SELECT nanivio_admin_malvi_overview('admin')")),{
        totalUsers:7,paidSubscribers:1,unsubscribedUsers:6,malviPaidSubscribers:1,malviTrialUsers:1,
      });
    });
    await t.test('concurrent debits with different IDs cannot overdraw the same balance',async()=>{
      sql(call(8,'voice','CREDIT',5));
      const attempts=await Promise.allSettled([9,10].map(id=>promisify(execFile)('psql',[...args,'-c',call(id,'voice','DEBIT',3)])));
      assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
      assert.equal(Number(sql("SELECT credit_balance FROM malvi_credit_accounts WHERE user_id='voice'")),2);
      assert.equal(Number(sql("SELECT voice_minutes_used FROM nanivio_malvi_subscriptions WHERE user_id='voice'")),10);
    });
  } finally {
    if(running) execFileSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});
    rmSync(root,{recursive:true,force:true});
  }
});
