-- Expand the existing verified, watch-only USDT rail. Never changes Paystack.
BEGIN;

CREATE TABLE IF NOT EXISTS public.nanivio_credit_purchase_requests (
  user_id text NOT NULL,
  request_id uuid NOT NULL,
  purchase jsonb NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.nanivio_credit_purchase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_credit_purchase_requests FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.nanivio_buy_communication_with_credit(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid text := payload->>'userId';
  v_request_id uuid := (payload->>'requestId')::uuid;
  intent jsonb := jsonb_build_object('tier',payload->>'tier','billingCycle',payload->>'billingCycle','currency',payload->>'currency');
  previous public.nanivio_credit_purchase_requests%ROWTYPE;
  result jsonb;
BEGIN
  IF nullif(uid,'') IS NULL OR v_request_id IS NULL OR coalesce((payload->>'price')::numeric,0)<=0
    OR coalesce(payload->>'currency','') NOT IN ('USD','GHS') THEN RAISE EXCEPTION 'Invalid credit purchase'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('credit-purchase:'||uid||':'||v_request_id));
  SELECT * INTO previous FROM nanivio_credit_purchase_requests r WHERE r.user_id=uid AND r.request_id=v_request_id;
  IF FOUND THEN
    IF previous.purchase<>intent THEN RAISE EXCEPTION 'This request belongs to another purchase'; END IF;
    RETURN previous.result || '{"alreadyFulfilled":true}'::jsonb;
  END IF;
  result := public.nanivio_billing_command('SUBSCRIPTION_FROM_WALLET',payload);
  IF coalesce((result->>'success')::boolean,false)=false THEN RAISE EXCEPTION 'Credit purchase was not delivered'; END IF;
  UPDATE nanivio_subscriptions SET auto_renew=false
    WHERE subscription_id=payload->>'subscriptionId' AND user_id=uid;
  result := jsonb_set(result,'{subscription,autoRenew}','false'::jsonb);
  INSERT INTO nanivio_credit_purchase_requests VALUES(uid,v_request_id,intent,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.nanivio_buy_communication_with_credit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_buy_communication_with_credit(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.nanivio_fulfill_tron_addon(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid text := payload->>'userId';
  ref text := payload->>'referenceId';
  tx text := payload->>'transactionId';
  purpose text := payload->>'purpose';
  product jsonb := payload->'product';
  paid numeric := (payload->>'price')::numeric;
  credit numeric := (product->>'creditAmountUSD')::numeric;
  minutes numeric := (product->>'minutes')::numeric;
  days integer := coalesce((product->>'validityDays')::integer,30);
  wallet public.nanivio_wallets%ROWTYPE;
  previous public.nanivio_payments%ROWTYPE;
  now_at timestamptz := now();
BEGIN
  IF payload->>'preflight'='true' THEN RETURN '{"success":true}'::jsonb; END IF;
  IF nullif(uid,'') IS NULL OR nullif(ref,'') IS NULL OR nullif(tx,'') IS NULL
    OR paid IS NULL OR paid<=0 OR payload->>'currency' IS DISTINCT FROM 'USDT'
    OR purpose IS NULL OR purpose NOT IN ('COMMUNICATION_TOPUP','COMMUNICATION_MINUTES') THEN
    RAISE EXCEPTION 'Invalid verified TRON add-on';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tron-addon:'||ref));
  SELECT * INTO previous FROM nanivio_payments
    WHERE provider='tron_usdt' AND provider_reference=ref FOR UPDATE;
  IF FOUND THEN
    IF previous.user_id<>uid OR previous.amount<>paid OR previous.purpose<>purpose OR previous.currency<>'USDT' THEN
      RAISE EXCEPTION 'Existing TRON payment conflicts with this purchase';
    END IF;
    RETURN '{"success":true,"alreadyFulfilled":true}'::jsonb;
  END IF;
  IF purpose='COMMUNICATION_TOPUP' THEN
    IF credit IS NULL OR credit<0.01 OR credit>100000 OR credit<>round(credit,2) THEN
      RAISE EXCEPTION 'Invalid USD Nanivio credit quote';
    END IF;
    INSERT INTO nanivio_wallets(user_id,account_type,currency)
      VALUES(uid,'COMMUNICATION','USD') ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT wallet FROM nanivio_wallets
      WHERE user_id=uid AND account_type='COMMUNICATION' AND currency='USD' FOR UPDATE;
    UPDATE nanivio_wallets SET available=available+credit,version=version+1,updated_at=now_at WHERE id=wallet.id;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,
      amount,balance_after,currency,entry_type,description,metadata)
      VALUES(tx,ref,wallet.id,uid,'COMMUNICATION','CREDIT',credit,wallet.available+credit,'USD',
        'TRON_USDT_TOPUP','USD Nanivio service credit purchased with verified USDT',payload->'metadata');
  ELSE
    IF minutes IS NULL OR minutes<=0 OR days<1 OR days>3650 THEN RAISE EXCEPTION 'Invalid minute-pack snapshot'; END IF;
    INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,
      started_at,current_period_start,current_period_end,next_billing_at,auto_renew,price_paid,currency,
      langpretation_minutes_quota,langpretation_minutes_remaining,voice_minutes_quota)
      VALUES(payload->>'subscriptionId',uid,product->>'id','individual_premium',product->>'name','MONTHLY',
        'ACTIVE',now_at,now_at,now_at+make_interval(days=>days),now_at+make_interval(days=>days),
        false,paid,'USDT',minutes,minutes,minutes);
  END IF;
  INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
    VALUES(uid,'tron_usdt',ref,paid,'USDT','PAID',purpose,payload->'metadata',now_at);
  INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,
    quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(tx,ref,uid,'COMMUNICATION',CASE WHEN purpose='COMMUNICATION_TOPUP' THEN 'BALANCE_TOPUP' ELSE 'COMMUNICATION_MINUTES' END,
      CASE WHEN purpose='COMMUNICATION_TOPUP' THEN credit ELSE minutes END,
      CASE WHEN purpose='COMMUNICATION_TOPUP' THEN 'USD credit' ELSE 'minutes' END,
      paid/CASE WHEN purpose='COMMUNICATION_TOPUP' THEN credit ELSE minutes END,
      paid,paid,'USDT','COMPLETED','TRON USDT',product->>'name');
  INSERT INTO nanivio_invoices(invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status,
    payment_method,paid_at,items)
    VALUES('inv_'||tx,'NV-TRON-'||md5(ref),uid,ref,paid,paid,'USDT','PAID','TRON USDT',now_at,
      jsonb_build_array(jsonb_build_object('description',product->>'name','quantity',
        CASE WHEN purpose='COMMUNICATION_TOPUP' THEN credit ELSE minutes END,
        'unit',CASE WHEN purpose='COMMUNICATION_TOPUP' THEN 'USD Nanivio credit' ELSE 'minutes' END,
        'amount',paid,'currency','USDT')));
  RETURN jsonb_build_object('success',true,'creditedUSD',credit,'minutes',minutes,'transactionId',tx);
END $$;
REVOKE ALL ON FUNCTION public.nanivio_fulfill_tron_addon(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_fulfill_tron_addon(jsonb) TO service_role;

-- Preserve the installed receipt verification, replay protection, expiry and
-- atomic activation. Abort rather than silently patch an unknown definition.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.nanivio_tron_usdt_command(text,jsonb)'::regprocedure);
  original text;
BEGIN
  IF position('nanivio_fulfill_tron_addon' IN definition)=0 THEN
    original := definition;
    definition := replace(definition,
      'purchase->>''purpose'' NOT IN (''SUBSCRIPTION'',''MALVI_SUBSCRIPTION'')',
      'purchase->>''purpose'' NOT IN (''SUBSCRIPTION'',''MALVI_SUBSCRIPTION'',''COMMUNICATION_TOPUP'',''COMMUNICATION_MINUTES'')');
    IF definition=original THEN RAISE EXCEPTION 'Unknown TRON create guard; apply the original crypto migration first'; END IF;
    original := definition;
    definition := replace(definition,
      'RETURN ''{"success":true}''::jsonb;',
      'PERFORM public.nanivio_fulfill_tron_addon(''{"preflight":true}''::jsonb);
       RETURN ''{"success":true,"paymentPurposes":["SUBSCRIPTION","MALVI_SUBSCRIPTION","COMMUNICATION_TOPUP","COMMUNICATION_MINUTES"]}''::jsonb;');
    IF definition=original THEN RAISE EXCEPTION 'Unknown TRON preflight'; END IF;
    original := definition;
    definition := replace(definition,
      'IF purchase->>''purpose''=''MALVI_SUBSCRIPTION'' THEN',
      'IF purchase->>''purpose'' IN (''COMMUNICATION_TOPUP'',''COMMUNICATION_MINUTES'') THEN
         result := public.nanivio_fulfill_tron_addon(result || jsonb_build_object(''purpose'',purchase->>''purpose'',''product'',product));
       ELSIF purchase->>''purpose''=''MALVI_SUBSCRIPTION'' THEN');
    IF definition=original THEN RAISE EXCEPTION 'Unknown TRON activation dispatch'; END IF;
    definition := replace(definition,
      ' activated. Your purchased allowances are ready. Renew manually before your term ends.',
      ' delivered. Your purchased benefits are ready.');
    EXECUTE definition;
  END IF;
END $migration$;
COMMIT;

SELECT (public.nanivio_tron_usdt_command('PREFLIGHT','{}'::jsonb)->'paymentPurposes')
  ?& ARRAY['COMMUNICATION_TOPUP','COMMUNICATION_MINUTES'] AS tron_all_billing_installed;
