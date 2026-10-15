-- Additive: verified external payments grant a new paid term without debiting wallets.
-- Existing free grants and independently purchased minute packs keep their terms.
CREATE OR REPLACE FUNCTION nanivio_activate_paystack_subscription(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_user TEXT := NULLIF(payload->>'userId', '');
  p_ref TEXT := NULLIF(payload->>'referenceId', '');
  p_price NUMERIC := (payload->>'price')::numeric;
  p_currency TEXT := upper(payload->>'currency');
  p_days INT := (payload->>'periodDays')::int;
  v_now TIMESTAMPTZ := now();
  v_end TIMESTAMPTZ;
  v_invoice TEXT := 'inv_' || replace(gen_random_uuid()::text, '-', '');
  previous_payment nanivio_payments%ROWTYPE;
  sub_row nanivio_subscriptions%ROWTYPE;
BEGIN
  IF payload->>'preflight' = 'true' THEN
    RETURN jsonb_build_object('success',true,'ready',true);
  END IF;
  IF p_user IS NULL OR p_ref IS NULL OR NULLIF(payload->>'planId','') IS NULL
    OR NULLIF(payload->>'subscriptionId','') IS NULL OR NULLIF(payload->>'transactionId','') IS NULL
    OR p_price IS NULL OR p_price <= 0 OR p_price::text IN ('NaN','Infinity','-Infinity')
    OR p_currency IS NULL OR p_currency NOT IN ('GHS','USD')
    OR p_days IS NULL OR p_days NOT IN (30,365) THEN
    RAISE EXCEPTION 'A configured paid plan and verified positive payment are required';
  END IF;
  IF COALESCE((payload->>'langpretationQuota')::numeric,0) < 0
    OR COALESCE((payload->>'voiceQuota')::numeric,0) < 0
    OR COALESCE((payload->>'malviQuota')::numeric,0) < 0 THEN
    RAISE EXCEPTION 'Plan allowances cannot be negative';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-paystack:' || p_ref));
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:' || p_user));
  SELECT * INTO previous_payment FROM nanivio_payments
    WHERE provider='paystack' AND provider_reference=p_ref FOR UPDATE;
  IF FOUND THEN
    IF previous_payment.user_id <> p_user OR previous_payment.amount <> p_price
      OR previous_payment.currency <> p_currency OR previous_payment.purpose <> 'SUBSCRIPTION' THEN
      RAISE EXCEPTION 'Payment reference does not match this subscription';
    END IF;
    RETURN jsonb_build_object('success',true,'alreadyFulfilled',true);
  END IF;
  v_end := v_now + make_interval(days => p_days);
  INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
    VALUES(p_user,'paystack',p_ref,p_price,p_currency,'PAID','SUBSCRIPTION',
      jsonb_build_object('planId',payload->>'planId','billingCycle',payload->>'billingCycle'),v_now);
  INSERT INTO nanivio_subscriptions(
    subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,
    current_period_end,next_billing_at,auto_renew,price_paid,currency,
    langpretation_minutes_quota,langpretation_minutes_remaining,voice_minutes_quota,malvi_units_quota)
    VALUES(payload->>'subscriptionId',p_user,payload->>'planId',payload->>'tier',payload->>'planName',
      payload->>'billingCycle','ACTIVE',v_now,v_now,v_end,v_end,false,p_price,p_currency,
      COALESCE((payload->>'langpretationQuota')::numeric,0),COALESCE((payload->>'langpretationQuota')::numeric,0),
      COALESCE((payload->>'voiceQuota')::numeric,0),COALESCE((payload->>'malviQuota')::numeric,0))
    RETURNING * INTO sub_row;
  INSERT INTO nanivio_billing_transactions(
    transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,
    currency,status,payment_method,notes)
    VALUES(payload->>'transactionId',p_ref,p_user,'SUBSCRIPTION','BUSINESS_USAGE',1,
      CASE WHEN p_days=365 THEN 'year' ELSE 'month' END,p_price,p_price,p_price,
      p_currency,'COMPLETED','Paystack','Verified paid communication subscription');
  INSERT INTO nanivio_invoices(
    invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status,payment_method,
    issued_at,paid_at,due_date,items)
    VALUES(v_invoice,'NV-' || substr(md5(p_ref),1,20),p_user,p_ref,p_price,p_price,p_currency,'PAID','Paystack',
      v_now,v_now,v_now,jsonb_build_array(jsonb_build_object('id',v_invoice,'description',payload->>'planName',
        'quantity',1,'unit','plan','unitPrice',p_price,'subtotal',p_price,'total',p_price)));
  INSERT INTO nanivio_billing_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES(p_user,'PAYSTACK_SUBSCRIPTION_ACTIVATED','SUBSCRIPTION',sub_row.subscription_id,
      jsonb_build_object('reference',p_ref,'amount',p_price,'currency',p_currency));
  RETURN jsonb_build_object('success',true,'invoiceId',v_invoice,'subscription',jsonb_build_object(
    'id',sub_row.subscription_id,'userId',p_user,'planId',sub_row.plan_id,'tier',sub_row.tier,
    'planName',sub_row.plan_name,'billingCycle',sub_row.billing_cycle,'status','ACTIVE','autoRenew',false,
    'pricePaid',p_price,'currency',p_currency,'currentPeriodEnd',extract(epoch from v_end)*1000,
    'langpretationMinutesQuota',sub_row.langpretation_minutes_quota,
    'langpretationMinutesRemaining',sub_row.langpretation_minutes_remaining));
END $$;
REVOKE ALL ON FUNCTION nanivio_activate_paystack_subscription(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nanivio_activate_paystack_subscription(JSONB) TO service_role;
