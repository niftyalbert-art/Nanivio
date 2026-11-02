-- Verified external payments only. Server-only RPC, additive and safe to rerun.
-- Run after 002, 003 and 005. Does not alter existing purchases or balances.
CREATE OR REPLACE FUNCTION public.nanivio_activate_paystack_malvi(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid TEXT := NULLIF(payload->>'userId','');
  ref TEXT := NULLIF(payload->>'referenceId','');
  sid TEXT := 'malvi_' || ref;
  price NUMERIC := (payload->>'price')::numeric;
  currency_code TEXT := upper(payload->>'currency');
  voice_minutes NUMERIC := (payload->>'voiceMinutesAllowed')::numeric;
  video_minutes NUMERIC := (payload->>'videoMinutesAllowed')::numeric;
  cycle TEXT := payload->>'billingCycle';
  t TIMESTAMPTZ := now();
  payment public.nanivio_payments%ROWTYPE;
  subscription public.nanivio_malvi_subscriptions%ROWTYPE;
  account public.malvi_credit_accounts%ROWTYPE;
  credit_id UUID;
  already_paid BOOLEAN := false;
BEGIN
  IF payload->>'preflight'='true' THEN
    RETURN jsonb_build_object('success',true,'ready',true);
  END IF;
  IF uid IS NULL OR ref IS NULL OR NULLIF(payload->>'planId','') IS NULL
    OR NULLIF(payload->>'tier','') IS NULL OR NULLIF(payload->>'planName','') IS NULL
    OR NULLIF(payload->>'transactionId','') IS NULL
    OR price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity')
    OR currency_code IS NULL OR currency_code NOT IN ('GHS','USD')
    OR cycle IS NULL OR cycle NOT IN ('MONTHLY','ANNUAL')
    OR voice_minutes IS NULL OR video_minutes IS NULL
    OR voice_minutes::text IN ('NaN','Infinity','-Infinity')
    OR video_minutes::text IN ('NaN','Infinity','-Infinity')
    OR voice_minutes<0 OR video_minutes<0
    OR voice_minutes>1000000 OR video_minutes>1000000
    OR trunc(voice_minutes)<>voice_minutes OR trunc(video_minutes)<>video_minutes THEN
    RAISE EXCEPTION 'A verified payment and valid purchased Malvi allowances are required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-paystack:' || ref));
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:' || uid));
  SELECT * INTO payment FROM nanivio_payments
    WHERE provider='paystack' AND provider_reference=ref FOR UPDATE;
  already_paid := FOUND;
  IF already_paid THEN
    IF payment.user_id<>uid OR payment.amount<>price OR payment.currency<>currency_code
      OR payment.purpose<>'MALVI_SUBSCRIPTION' OR payment.status<>'PAID' THEN
      RAISE EXCEPTION 'Payment reference does not match this Malvi purchase';
    END IF;
    SELECT * INTO subscription FROM nanivio_malvi_subscriptions
      WHERE subscription_id=sid AND user_id=uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paid Malvi record requires administrator reconciliation'; END IF;
  ELSE
    INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
      VALUES(uid,'paystack',ref,price,currency_code,'PAID','MALVI_SUBSCRIPTION',
        COALESCE(payload->'metadata','{}'::jsonb),t);
    INSERT INTO nanivio_malvi_subscriptions(
      subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,
      current_period_start,current_period_end,next_billing_at,price_paid,currency,
      video_minutes_allowed,voice_minutes_allowed,auto_renew)
      VALUES(sid,uid,payload->>'planId',payload->>'tier',payload->>'planName',cycle,'ACTIVE',t,t,
        t+make_interval(days=>CASE WHEN cycle='ANNUAL' THEN 365 ELSE 30 END),
        t+make_interval(days=>CASE WHEN cycle='ANNUAL' THEN 365 ELSE 30 END),
        price,currency_code,video_minutes,voice_minutes,false)
      RETURNING * INTO subscription;
    INSERT INTO nanivio_billing_transactions(
      transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,
      subtotal,total,currency,status,payment_method,notes)
      VALUES(payload->>'transactionId',ref,uid,'MALVI_AI','MALVI_REQUESTS',1,
        CASE WHEN cycle='ANNUAL' THEN 'year' ELSE 'month' END,price,price,price,currency_code,
        'COMPLETED','Paystack','Verified Malvi subscription');
    INSERT INTO nanivio_invoices(
      invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,
      status,issued_at,paid_at,items)
      VALUES('inv_malvi_'||ref,'INV-MALVI-'||ref,uid,ref,price,price,currency_code,
        'PAID',t,t,jsonb_build_array(jsonb_build_object(
          'description',payload->>'planName','quantity',1,'unitPrice',price,'total',price)));
  END IF;
  -- Use the same entitlement reference as the legacy lazy-credit path. Credit
  -- and subscription commit together; retries cannot refill consumed minutes.
  INSERT INTO malvi_credit_accounts(user_id,credit_balance) VALUES(uid,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO account FROM malvi_credit_accounts WHERE user_id=uid FOR UPDATE;
  IF greatest(subscription.voice_minutes_allowed,subscription.video_minutes_allowed)>0 THEN
    INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,status,metadata)
      VALUES(account.id,uid,'CREDIT',greatest(subscription.voice_minutes_allowed,subscription.video_minutes_allowed),
        'MALVI_MINUTES','malvi_entitlement_'||sid,'MALVI_SUBSCRIPTION','POSTED',
        jsonb_build_object('planId',subscription.plan_id,'tier',subscription.tier,
          'periodStart',extract(epoch from subscription.current_period_start)*1000,
          'periodEnd',extract(epoch from subscription.current_period_end)*1000))
      ON CONFLICT(user_id,reference) DO NOTHING RETURNING id INTO credit_id;
    IF credit_id IS NOT NULL THEN
      UPDATE malvi_credit_accounts SET
        credit_balance=credit_balance+greatest(subscription.voice_minutes_allowed,subscription.video_minutes_allowed),
        version=version+1,updated_at=t WHERE id=account.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true,'alreadyFulfilled',already_paid,
    'subscription',jsonb_build_object(
      'id',sid,'userId',uid,'planId',subscription.plan_id,'tier',subscription.tier,
      'planName',subscription.plan_name,'billingCycle',subscription.billing_cycle,'status',subscription.status,
      'voiceMinutesAllowed',subscription.voice_minutes_allowed,'videoMinutesAllowed',subscription.video_minutes_allowed,
      'voiceMinutesRemaining',greatest(0,subscription.voice_minutes_allowed-subscription.voice_minutes_used),
      'videoMinutesRemaining',greatest(0,subscription.video_minutes_allowed-subscription.video_minutes_used),
      'currentPeriodEnd',extract(epoch from subscription.current_period_end)*1000,'autoRenew',false));
END $$;
REVOKE ALL ON FUNCTION public.nanivio_activate_paystack_malvi(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_activate_paystack_malvi(JSONB) TO service_role;

-- Finishing an old trial session updates its row. That maintenance timestamp
-- must not supersede a newer purchased term when the next live session starts.
DO $migration$
DECLARE
  function_id REGPROCEDURE := to_regprocedure('public.nanivio_reserve_malvi_live(text,text,text,integer)');
  definition TEXT;
BEGIN
  IF function_id IS NOT NULL THEN
    definition:=pg_get_functiondef(function_id);
    definition:=replace(definition,
      'ORDER BY updated_at DESC,subscription_id DESC LIMIT 1 FOR UPDATE',
      'ORDER BY CASE WHEN status IN (''ACTIVE'',''TRIAL'') AND current_period_start<=t AND current_period_end>t THEN 0 ELSE 1 END, current_period_start DESC,subscription_id DESC LIMIT 1 FOR UPDATE');
    EXECUTE definition;
  END IF;
END;
$migration$;
