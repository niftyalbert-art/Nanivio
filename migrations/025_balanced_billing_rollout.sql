-- Apply AFTER 024 and the existing billing/communication/Malvi migrations.
-- Only newly purchased, versioned terms are enrolled. Existing paid terms,
-- invoices, trial counters and outstanding paid-order snapshots are untouched.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.nanivio_balanced_ledger_revision()') IS NULL THEN
    RAISE EXCEPTION 'Apply the current migration 024 before migration 025';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.nanivio_balanced_terms (
  subscription_id text PRIMARY KEY, user_id text NOT NULL,
  family text NOT NULL CHECK(family IN ('malvi','communication')),
  snapshot jsonb NOT NULL, started_at timestamptz NOT NULL,
  allocation integer NOT NULL DEFAULT 0, allocation_ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.nanivio_balanced_reservation_links (
  event_id text PRIMARY KEY, user_id text NOT NULL,
  source text NOT NULL, resource text NOT NULL, amount numeric NOT NULL,
  request_event text
);
CREATE TABLE IF NOT EXISTS public.nanivio_balanced_pack_receipts (
  provider text NOT NULL, reference text NOT NULL, user_id text NOT NULL,
  snapshot jsonb NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY(provider,reference)
);
CREATE TABLE IF NOT EXISTS public.nanivio_balanced_malvi_pack_leases (
  lease_id text PRIMARY KEY, user_id text NOT NULL, subscription_id text NOT NULL,
  mode text NOT NULL, seconds integer NOT NULL, settled boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION public.nanivio_capture_balanced_terms(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb:=coalesce(p->'metadata'->'billingTerms',p->'metadata'->'product'->'billingTerms',
  p->'metadata'->'planSnapshot'->'billingTerms');
  uid text:=p->>'userId'; sid text:=p->>'subscriptionId';
  t timestamptz; a record; expiry timestamptz; extra numeric; credit_id uuid;
  meter jsonb; existing nanivio_balanced_terms%ROWTYPE;
BEGIN
  IF s IS NULL OR s='null'::jsonb THEN RETURN; END IF;
  PERFORM nanivio_validate_pricing_snapshot(s);
  IF s->>'kind'<>'subscription' THEN RAISE EXCEPTION 'A subscription snapshot is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||uid));
  SELECT * INTO existing FROM nanivio_balanced_terms WHERE subscription_id=sid;
  IF FOUND THEN
    IF existing.user_id<>uid OR existing.snapshot<>s THEN RAISE EXCEPTION 'Purchased terms differ from original activation'; END IF;
    RETURN;
  END IF;
  IF s->>'family'='malvi' THEN
    SELECT started_at INTO t FROM nanivio_malvi_subscriptions WHERE subscription_id=sid AND user_id=uid;
  ELSE
    SELECT started_at INTO t FROM nanivio_subscriptions WHERE subscription_id=sid AND user_id=uid;
  END IF;
  IF t IS NULL THEN RAISE EXCEPTION 'The paid subscription must be activated first'; END IF;
  SELECT * INTO a FROM nanivio_pricing_allocation(s,t,t);
  expiry:=CASE WHEN s->>'cycle'='ANNUAL' THEN ((t AT TIME ZONE 'UTC')+interval '12 months') AT TIME ZONE 'UTC'
    ELSE t+interval '720 hours' END;
  INSERT INTO nanivio_balanced_terms VALUES(sid,uid,s->>'family',s,t,0,a.ends_at,expiry);
  IF s->>'family'='communication' THEN
    UPDATE nanivio_subscriptions SET current_period_end=expiry,next_billing_at=expiry,auto_renew=false WHERE subscription_id=sid;
    UPDATE nanivio_communication_text_terms SET allowance=(s->'limits'->>'textCharacters')::numeric
      WHERE subscription_id=sid;
  ELSE
    UPDATE nanivio_malvi_subscriptions SET current_period_end=expiry,next_billing_at=expiry,auto_renew=false WHERE subscription_id=sid;
    -- Older fulfilment credits MAX(voice,avatar). New independent balances need
    -- SUM, once only. This does not change any pre-cutover subscription.
    IF p->>'walletPurchase'='true' THEN
      PERFORM nanivio_malvi_credit_command('CREDIT',jsonb_build_object('userId',uid,
        'amount',greatest((s->'limits'->>'voiceSeconds')::numeric,(s->'limits'->>'avatarSeconds')::numeric)/60,
        'reference','malvi_entitlement_'||sid,'source','MALVI_SUBSCRIPTION','creditType','MALVI_MINUTES'));
    END IF;
    extra:=least((s->'limits'->>'voiceSeconds')::numeric,(s->'limits'->>'avatarSeconds')::numeric)/60;
    IF extra>0 THEN
      INSERT INTO malvi_credit_accounts(user_id,credit_balance) VALUES(uid,0) ON CONFLICT(user_id) DO NOTHING;
      SELECT id INTO credit_id FROM malvi_credit_accounts WHERE user_id=uid FOR UPDATE;
      INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
        VALUES(credit_id,uid,'CREDIT',extra,'MALVI_MINUTES','balanced_separate_'||sid,'BALANCED_SUBSCRIPTION',
          jsonb_build_object('subscriptionId',sid));
      UPDATE malvi_credit_accounts SET credit_balance=credit_balance+extra,version=version+1 WHERE id=credit_id;
    END IF;
    IF jsonb_typeof(p->'metadata'->'planSnapshot'->'capabilities')='array' THEN
      UPDATE nanivio_malvi_subscriptions SET capabilities=p->'metadata'->'planSnapshot'->'capabilities' WHERE subscription_id=sid;
    END IF;
  END IF;
  -- Request/search/storage accounting is additional to the existing seconds /
  -- characters meters. Zero those resources here to prevent double allowances.
  meter:=jsonb_set(s,'{limits,callSeconds}','0');
  meter:=jsonb_set(meter,'{limits,translationUnits}','0');
  meter:=jsonb_set(meter,'{limits,textCharacters}','0');
  meter:=jsonb_set(meter,'{limits,voiceSeconds}','0');
  meter:=jsonb_set(meter,'{limits,avatarSeconds}','0');
  PERFORM nanivio_balanced_usage('GRANT',jsonb_build_object('userId',uid,'grantId','terms_'||sid,
    'reference','terms_'||sid,'snapshot',meter));
  UPDATE nanivio_pricing_grants SET started_at=t WHERE grant_id='terms_'||sid AND user_id=uid;
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_refresh_balanced_terms(p_user text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE term record; a record; lease record; old_left numeric; fresh numeric; account record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||p_user));
  FOR term IN SELECT * FROM nanivio_balanced_terms WHERE user_id=p_user AND allocation_ends_at<=now()
    AND expires_at>now() FOR UPDATE
  LOOP
    SELECT * INTO a FROM nanivio_pricing_allocation(term.snapshot,term.started_at,now());
    IF a.allocation IS NULL OR a.allocation=term.allocation THEN CONTINUE; END IF;
    IF term.family='communication' THEN
      -- Refund stale escrow BEFORE resetting counters, never against a new month.
      UPDATE nanivio_communication_reservations SET expires_at=now()-interval '1 second'
        WHERE subscription_id=term.subscription_id AND status='RESERVED';
      PERFORM nanivio_communication_access_pre_balanced('ACCESS',jsonb_build_object('userId',p_user));
      UPDATE nanivio_subscriptions SET voice_minutes_used=0,langpretation_minutes_used=0,
        voice_minutes_quota=(term.snapshot->'limits'->>'callSeconds')::numeric/60,
        langpretation_minutes_quota=(term.snapshot->'limits'->>'translationUnits')::numeric/80000,
        langpretation_minutes_remaining=(term.snapshot->'limits'->>'translationUnits')::numeric/80000
        WHERE subscription_id=term.subscription_id;
      UPDATE nanivio_communication_text_terms SET used=0,
        allowance=(term.snapshot->'limits'->>'textCharacters')::numeric WHERE subscription_id=term.subscription_id;
    ELSE
      FOR lease IN SELECT lease_id FROM nanivio_malvi_live_leases
        WHERE subscription_id=term.subscription_id AND settled_at IS NULL AND ends_at<=clock_timestamp()
      LOOP PERFORM nanivio_finish_malvi_live(lease.lease_id,false,true); END LOOP;
      SELECT greatest(0,voice_minutes_allowed-voice_minutes_used)+greatest(0,video_minutes_allowed-video_minutes_used)
        INTO old_left FROM nanivio_malvi_subscriptions WHERE subscription_id=term.subscription_id FOR UPDATE;
      fresh:=((term.snapshot->'limits'->>'voiceSeconds')::numeric+(term.snapshot->'limits'->>'avatarSeconds')::numeric)/60;
      SELECT * INTO account FROM malvi_credit_accounts WHERE user_id=p_user FOR UPDATE;
      old_left:=least(coalesce(old_left,0),account.credit_balance);
      IF old_left>0 THEN
        INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
          VALUES(account.id,p_user,'DEBIT',old_left,'MALVI_MINUTES','balanced_expire_'||term.subscription_id||'_'||a.allocation,
            'BALANCED_ALLOCATION',jsonb_build_object('subscriptionId',term.subscription_id,'allocation',a.allocation));
      END IF;
      IF fresh>0 THEN
        INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
          VALUES(account.id,p_user,'CREDIT',fresh,'MALVI_MINUTES','balanced_month_'||term.subscription_id||'_'||a.allocation,
            'BALANCED_ALLOCATION',jsonb_build_object('subscriptionId',term.subscription_id,'allocation',a.allocation));
      END IF;
      UPDATE malvi_credit_accounts SET credit_balance=greatest(0,credit_balance-coalesce(old_left,0))+fresh,version=version+1
        WHERE user_id=p_user;
      UPDATE nanivio_malvi_subscriptions SET voice_minutes_used=0,video_minutes_used=0,
        voice_minutes_allowed=(term.snapshot->'limits'->>'voiceSeconds')::numeric/60,
        video_minutes_allowed=(term.snapshot->'limits'->>'avatarSeconds')::numeric/60 WHERE subscription_id=term.subscription_id;
    END IF;
    UPDATE nanivio_balanced_terms SET allocation=a.allocation,allocation_ends_at=a.ends_at WHERE subscription_id=term.subscription_id;
  END LOOP;
  RETURN '{"success":true}'::jsonb;
END $$;

-- Retain the original payment verification, wallet debit, invoices and replay
-- logic, and capture new versioned terms in THE SAME database transaction.
DO $$ BEGIN
  IF to_regprocedure('public.nanivio_activate_paystack_subscription_pre_balanced(jsonb)') IS NULL THEN
    ALTER FUNCTION public.nanivio_activate_paystack_subscription(jsonb) RENAME TO nanivio_activate_paystack_subscription_pre_balanced;
    ALTER FUNCTION public.nanivio_activate_paystack_malvi(jsonb) RENAME TO nanivio_activate_paystack_malvi_pre_balanced;
    ALTER FUNCTION public.nanivio_billing_command(text,jsonb) RENAME TO nanivio_billing_command_pre_balanced;
    ALTER FUNCTION public.nanivio_communication_access(text,jsonb) RENAME TO nanivio_communication_access_pre_balanced;
    ALTER FUNCTION public.nanivio_fulfill_tron_addon(jsonb) RENAME TO nanivio_fulfill_tron_addon_pre_balanced;
    ALTER FUNCTION public.nanivio_reserve_malvi_live(text,text,text,integer) RENAME TO nanivio_reserve_malvi_live_pre_balanced;
    ALTER FUNCTION public.nanivio_finish_malvi_live(text,boolean,boolean) RENAME TO nanivio_finish_malvi_live_pre_balanced;
    ALTER FUNCTION public.nanivio_activate_tron_usdt_subscription(jsonb) RENAME TO nanivio_activate_tron_usdt_subscription_pre_balanced;
    ALTER FUNCTION public.nanivio_activate_tron_usdt_malvi(jsonb) RENAME TO nanivio_activate_tron_usdt_malvi_pre_balanced;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_activate_paystack_subscription(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=nanivio_activate_paystack_subscription_pre_balanced(payload);
  IF coalesce((result->>'success')::boolean,false) AND payload->>'preflight' IS DISTINCT FROM 'true' THEN
    PERFORM nanivio_capture_balanced_terms(payload||jsonb_build_object('subscriptionId',coalesce(result->'subscription'->>'id',payload->>'subscriptionId')));
  END IF;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_activate_paystack_malvi(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=nanivio_activate_paystack_malvi_pre_balanced(payload);
  IF coalesce((result->>'success')::boolean,false) AND payload->>'preflight' IS DISTINCT FROM 'true' THEN
    PERFORM nanivio_capture_balanced_terms(payload||jsonb_build_object('subscriptionId',coalesce(result->'subscription'->>'id',payload->>'subscriptionId')));
  END IF;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_billing_command(command_name text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=nanivio_billing_command_pre_balanced(command_name,payload);
  IF coalesce((result->>'success')::boolean,false) AND command_name IN ('SUBSCRIPTION_FROM_WALLET','MALVI_SUBSCRIPTION_FROM_WALLET') THEN
    PERFORM nanivio_capture_balanced_terms(payload||jsonb_build_object('walletPurchase',true,'subscriptionId',
      CASE WHEN command_name='MALVI_SUBSCRIPTION_FROM_WALLET' THEN 'malvi_'||(payload->>'referenceId')
      ELSE coalesce(result->'subscription'->>'id',payload->>'subscriptionId') END));
  END IF;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_activate_tron_usdt_subscription(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=nanivio_activate_tron_usdt_subscription_pre_balanced(payload);
  IF coalesce((result->>'success')::boolean,false) THEN
    PERFORM nanivio_capture_balanced_terms(payload||jsonb_build_object('subscriptionId',coalesce(result->'subscription'->>'id',payload->>'subscriptionId')));
  END IF;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_activate_tron_usdt_malvi(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  result:=nanivio_activate_tron_usdt_malvi_pre_balanced(payload);
  IF coalesce((result->>'success')::boolean,false) THEN
    PERFORM nanivio_capture_balanced_terms(payload||jsonb_build_object('subscriptionId',coalesce(result->'subscription'->>'id',payload->>'subscriptionId')));
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_fulfill_balanced_pack(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid text:=payload->>'userId'; ref text:=payload->>'referenceId'; s jsonb:=payload->'billingTerms';
  method text:=payload->>'method'; price numeric:=(payload->>'price')::numeric;
  currency_code text:=payload->>'currency'; provider_name text; result jsonb; previous record;
  wallet nanivio_wallets%ROWTYPE; tx text:=payload->>'transactionId'; invoice text:='balanced_'||md5(payload->>'referenceId');
BEGIN
  PERFORM nanivio_validate_pricing_snapshot(s);
  IF s->>'kind'<>'pack' OR nullif(uid,'') IS NULL OR nullif(ref,'') IS NULL OR nullif(tx,'') IS NULL
    OR price IS NULL OR price<=0 OR price<>round(price,2) OR price>100000
    OR coalesce(method,'') NOT IN ('PAYSTACK','CREDIT','TRON') OR coalesce(currency_code,'') NOT IN ('USD','GHS','USDT')
    OR (method='TRON')<>(currency_code='USDT') THEN RAISE EXCEPTION 'Invalid verified pack purchase'; END IF;
  provider_name:=CASE method WHEN 'PAYSTACK' THEN 'paystack' WHEN 'TRON' THEN 'tron_usdt' ELSE 'nanivio_credit' END;
  PERFORM pg_advisory_xact_lock(hashtext('balanced-pack:'||provider_name||':'||ref));
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||uid));
  SELECT * INTO previous FROM nanivio_balanced_pack_receipts WHERE provider=provider_name AND reference=ref;
  IF FOUND THEN
    IF previous.user_id<>uid OR previous.snapshot<>s OR previous.amount<>price OR previous.currency<>currency_code THEN
      RAISE EXCEPTION 'Pack payment does not match original purchase';
    END IF;
    RETURN previous.result||'{"alreadyFulfilled":true}'::jsonb;
  END IF;
  IF method='CREDIT' THEN
    SELECT * INTO wallet FROM nanivio_wallets WHERE user_id=uid AND account_type='COMMUNICATION' AND currency=currency_code FOR UPDATE;
    IF NOT FOUND OR wallet.available<price THEN RAISE EXCEPTION 'Insufficient Nanivio credit'; END IF;
    UPDATE nanivio_wallets SET available=available-price,version=version+1,updated_at=now() WHERE id=wallet.id;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description)
      VALUES(tx,ref,wallet.id,uid,'COMMUNICATION','DEBIT',price,wallet.available-price,currency_code,'SUBSCRIPTION_PAYMENT',s->>'productName');
  ELSE
    INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
      VALUES(uid,provider_name,ref,price,currency_code,'PAID','COMMUNICATION_MINUTES',jsonb_build_object('billingTerms',s),now());
  END IF;
  PERFORM nanivio_balanced_usage('GRANT',jsonb_build_object('userId',uid,'grantId','pack_'||provider_name||'_'||ref,
    'reference','pack_'||provider_name||'_'||ref,'snapshot',s));
  INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,
    quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(tx,ref,uid,'COMMUNICATION','COMMUNICATION_MINUTES',1,'pack',price,price,price,currency_code,'COMPLETED',method,s->>'productName');
  INSERT INTO nanivio_invoices(invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status,payment_method,issued_at,paid_at,due_date,items)
    VALUES(invoice,'NV-'||md5(ref),uid,ref,price,price,currency_code,'PAID',method,now(),now(),now(),
      jsonb_build_array(jsonb_build_object('description',s->>'productName','quantity',1,'unit','pack','unitPrice',price,'total',price)));
  result:=jsonb_build_object('success',true,'productName',s->>'productName','benefits',s->'limits',
    'expiryDate',extract(epoch FROM now()+interval '720 hours')*1000,
    'message',(s->>'productName')||' activated. Valid for 30 days. Your existing subscription is unchanged.');
  INSERT INTO nanivio_balanced_pack_receipts VALUES(provider_name,ref,uid,s,price,currency_code,result);
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_fulfill_tron_addon(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF payload->'product'->'billingTerms' IS NOT NULL THEN
    RETURN nanivio_fulfill_balanced_pack(payload||jsonb_build_object('method','TRON','billingTerms',payload->'product'->'billingTerms'));
  END IF;
  RETURN nanivio_fulfill_tron_addon_pre_balanced(payload);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_communication_access(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid text:=payload->>'userId'; eid text:=payload->>'eventId'; kind text:=payload->>'resource';
  result jsonb; pack_access jsonb; pack_result jsonb; request_id text; balance jsonb; base_quota numeric;
  link nanivio_balanced_reservation_links%ROWTYPE; new_term boolean;
  resource_key text; amount numeric; units numeric; ratio numeric;
BEGIN
  IF action IN ('POLICY','SAVE_POLICY') THEN RETURN nanivio_communication_access_pre_balanced(action,payload); END IF;
  PERFORM nanivio_refresh_balanced_terms(uid);
  IF action IN ('ACCESS','CONNECT') THEN
    result:=nanivio_communication_access_pre_balanced(action,payload);
    balance:=nanivio_balanced_usage('ACCESS',jsonb_build_object('userId',uid));
    pack_access:=balance->'remaining';
    SELECT langpretation_minutes_quota INTO base_quota FROM nanivio_subscriptions
      WHERE user_id=uid AND status='ACTIVE' AND tier<>'free' AND current_period_end>now()
      ORDER BY current_period_start DESC,created_at DESC LIMIT 1;
    RETURN result||jsonb_build_object(
      'callSecondsRemaining',CASE WHEN result->'callSecondsRemaining'='null' AND
        ((result->>'trialEndsAt')::timestamptz>now() OR
          (result->'trialStartedAt'='null' AND (result->'policy'->>'callTrialDays')::int>0)) THEN NULL
        ELSE coalesce((result->>'callSecondsRemaining')::numeric,0)+coalesce((pack_access->>'callSeconds')::numeric,0) END,
      'translationQuotaMinutes',coalesce(base_quota,0)+coalesce((balance->'quota'->>'translationUnits')::numeric,0)/80000,
      'sharedCallMinutes',coalesce((result->>'sharedCallMinutes')::numeric,0)+coalesce((pack_access->>'callSeconds')::numeric,0)/60,
      'translatedSecondsRemaining',coalesce((result->>'translatedSecondsRemaining')::numeric,0)+coalesce((pack_access->>'translationUnits')::numeric,0)*60/80000,
      'textCharactersRemaining',coalesce((result->>'textCharactersRemaining')::numeric,0)+coalesce((pack_access->>'textCharacters')::numeric,0),
      'textRequestsRemaining',pack_access->'textRequests',
      'paidUntil',coalesce(result->>'paidUntil',balance->>'nextBoundary'),
      'paid',(result->>'paid')::boolean OR coalesce((pack_access->>'callSeconds')::numeric,0)>0
        OR coalesce((pack_access->>'translationUnits')::numeric,0)>0 OR coalesce((pack_access->>'textRequests')::numeric,0)>0);
  END IF;
  IF action IN ('COMMIT','RELEASE') THEN
    SELECT * INTO link FROM nanivio_balanced_reservation_links WHERE event_id=eid;
    IF FOUND THEN
      IF link.user_id<>uid THEN RAISE EXCEPTION 'Usage event owner mismatch'; END IF;
      IF link.source='legacy' THEN result:=nanivio_communication_access_pre_balanced(action,payload);
      ELSE
        resource_key:=CASE link.resource WHEN 'call' THEN 'callSeconds' WHEN 'text' THEN 'textCharacters' ELSE 'translationUnits' END;
        ratio:=CASE WHEN link.resource IN ('live','note') THEN 80000::numeric/60 ELSE 1 END;
        units:=ceil(least(link.amount,coalesce((payload->>'used')::numeric,link.amount))*ratio);
        result:=nanivio_balanced_usage(action,jsonb_build_object('userId',uid,'eventId',eid,
          'usage',jsonb_build_object(resource_key,units)));
      END IF;
      IF link.request_event IS NOT NULL THEN
        PERFORM nanivio_balanced_usage(CASE WHEN action='COMMIT' AND (result->>'success')::boolean THEN 'COMMIT' ELSE 'RELEASE' END,
          jsonb_build_object('userId',uid,'eventId',link.request_event));
      END IF;
      RETURN result;
    END IF;
    RETURN nanivio_communication_access_pre_balanced(action,payload);
  END IF;
  IF action<>'RESERVE' THEN RETURN nanivio_communication_access_pre_balanced(action,payload); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||uid));
  SELECT * INTO link FROM nanivio_balanced_reservation_links WHERE event_id=eid;
  IF FOUND THEN
    IF link.user_id<>uid OR link.resource<>kind OR link.amount<>(payload->>'amount')::numeric THEN RAISE EXCEPTION 'Usage event does not match request'; END IF;
    IF link.source='legacy' THEN RETURN nanivio_communication_access_pre_balanced(action,payload); END IF;
    pack_result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',uid,'eventId',eid,'usage',
      jsonb_build_object(CASE kind WHEN 'call' THEN 'callSeconds' WHEN 'text' THEN 'textCharacters' ELSE 'translationUnits' END,
        ceil(link.amount*CASE WHEN kind IN ('live','note') THEN 80000::numeric/60 ELSE 1 END))));
    RETURN pack_result||jsonb_build_object('amount',link.amount,'source','balanced_pack');
  END IF;
  SELECT EXISTS(SELECT 1 FROM nanivio_balanced_terms WHERE subscription_id=(SELECT subscription_id FROM nanivio_subscriptions
    WHERE user_id=uid AND tier<>'free' AND status='ACTIVE' AND current_period_end>now()
    ORDER BY current_period_start DESC,created_at DESC LIMIT 1)) INTO new_term;
  IF kind='text' AND new_term THEN
    request_id:=eid||'_request';
    pack_result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',uid,'eventId',request_id,'usage','{"textRequests":1}'::jsonb));
    IF NOT (pack_result->>'success')::boolean THEN RETURN pack_result||'{"error":"Your included text translation request allowance is used up."}'::jsonb; END IF;
  END IF;
  result:=nanivio_communication_access_pre_balanced(action,payload);
  IF NOT (result->>'success')::boolean THEN
    resource_key:=CASE kind WHEN 'call' THEN 'callSeconds' WHEN 'text' THEN 'textCharacters' ELSE 'translationUnits' END;
    ratio:=CASE WHEN kind IN ('live','note') THEN 80000::numeric/60 ELSE 1 END;
    amount:=(payload->>'amount')::numeric;
    pack_access:=nanivio_balanced_usage('ACCESS',jsonb_build_object('userId',uid))->'remaining';
    IF kind IN ('call','live') THEN amount:=least(amount,floor(coalesce((pack_access->>resource_key)::numeric,0)/ratio)); END IF;
    IF amount>0 THEN
      IF kind='text' AND request_id IS NULL THEN
        request_id:=eid||'_request';
        pack_result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',uid,'eventId',request_id,'usage','{"textRequests":1}'::jsonb));
        IF NOT (pack_result->>'success')::boolean THEN RETURN result; END IF;
      END IF;
      pack_result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',uid,'eventId',eid,
        'usage',jsonb_build_object(resource_key,ceil(amount*ratio))));
      IF (pack_result->>'success')::boolean THEN
        INSERT INTO nanivio_balanced_reservation_links VALUES(eid,uid,'pack',kind,amount,request_id);
        RETURN pack_result||jsonb_build_object('amount',amount,'source','balanced_pack');
      END IF;
    END IF;
    IF request_id IS NOT NULL THEN PERFORM nanivio_balanced_usage('RELEASE',jsonb_build_object('userId',uid,'eventId',request_id)); END IF;
    RETURN result;
  END IF;
  IF request_id IS NOT NULL THEN INSERT INTO nanivio_balanced_reservation_links VALUES(eid,uid,'legacy',kind,(result->>'amount')::numeric,request_id); END IF;
  RETURN result;
END $$;

-- Malvi add-ons escrow their own resource only when the plan's allowance runs out.
CREATE OR REPLACE FUNCTION public.nanivio_reserve_malvi_live(p_user text,p_lease text,p_mode text,p_max_seconds integer DEFAULT 600)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sub nanivio_malvi_subscriptions%ROWTYPE; term nanivio_balanced_terms%ROWTYPE;
  result jsonb; available jsonb; extra integer; remaining numeric; resource_key text; stale record; credit_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||p_user));
  PERFORM 1 FROM nanivio_users WHERE id=p_user FOR UPDATE;
  PERFORM nanivio_refresh_balanced_terms(p_user);
  FOR stale IN SELECT lease_id FROM nanivio_malvi_live_leases WHERE user_id=p_user
    AND settled_at IS NULL AND ends_at<=clock_timestamp()
  LOOP PERFORM nanivio_finish_malvi_live(stale.lease_id,false,true); END LOOP;
  SELECT * INTO sub FROM nanivio_malvi_subscriptions WHERE user_id=p_user AND status IN ('ACTIVE','TRIAL')
    AND current_period_end>now() ORDER BY current_period_start DESC,subscription_id DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO term FROM nanivio_balanced_terms WHERE subscription_id=sub.subscription_id;
  IF FOUND THEN p_max_seconds:=least(p_max_seconds,greatest(1,floor(extract(epoch FROM term.allocation_ends_at-clock_timestamp()))::integer)); END IF;
  IF EXISTS(SELECT 1 FROM nanivio_balanced_malvi_pack_leases WHERE lease_id=p_lease) THEN
    RETURN nanivio_reserve_malvi_live_pre_balanced(p_user,p_lease,p_mode,p_max_seconds);
  END IF;
  remaining:=CASE WHEN p_mode='voice' THEN sub.voice_minutes_allowed-sub.voice_minutes_used ELSE sub.video_minutes_allowed-sub.video_minutes_used END;
  IF remaining>0 OR sub.subscription_id IS NULL THEN
    RETURN nanivio_reserve_malvi_live_pre_balanced(p_user,p_lease,p_mode,p_max_seconds);
  END IF;
  resource_key:=CASE WHEN p_mode='voice' THEN 'voiceSeconds' ELSE 'avatarSeconds' END;
  result:=nanivio_balanced_usage('ACCESS',jsonb_build_object('userId',p_user));
  available:=result->'remaining';
  extra:=least(p_max_seconds,600,coalesce((available->>resource_key)::integer,0),
    greatest(0,floor(extract(epoch FROM (result->>'nextBoundary')::timestamptz-clock_timestamp()))::integer));
  IF extra<=0 THEN RETURN nanivio_reserve_malvi_live_pre_balanced(p_user,p_lease,p_mode,p_max_seconds); END IF;
  result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',p_user,'eventId','malvi_pack_'||p_lease,
    'usage',jsonb_build_object(resource_key,extra)));
  IF NOT (result->>'success')::boolean THEN RAISE EXCEPTION 'Malvi add-on allowance is unavailable'; END IF;
  -- Lease heartbeats provide authoritative crash accounting. A generic job TTL
  -- must not refund confirmed live speech before the lease reconciler runs.
  UPDATE nanivio_pricing_usage_events SET expires_at=clock_timestamp()+interval '366 days'
    WHERE event_id='malvi_pack_'||p_lease AND user_id=p_user;
  UPDATE nanivio_malvi_subscriptions SET
    voice_minutes_allowed=voice_minutes_allowed+CASE WHEN p_mode='voice' THEN extra::numeric/60 ELSE 0 END,
    video_minutes_allowed=video_minutes_allowed+CASE WHEN p_mode='avatar' THEN extra::numeric/60 ELSE 0 END WHERE subscription_id=sub.subscription_id;
  UPDATE malvi_credit_accounts SET credit_balance=credit_balance+round(extra::numeric/60,6),version=version+1
    WHERE user_id=p_user RETURNING id INTO credit_id;
  INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
    VALUES(credit_id,p_user,'CREDIT',round(extra::numeric/60,6),'MALVI_MINUTES','balanced_pack_bridge_'||p_lease,
      'BALANCED_PACK',jsonb_build_object('leaseId',p_lease,'resource',resource_key));
  result:=nanivio_reserve_malvi_live_pre_balanced(p_user,p_lease,p_mode,extra);
  INSERT INTO nanivio_balanced_malvi_pack_leases VALUES(p_lease,p_user,sub.subscription_id,p_mode,extra,false);
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_finish_malvi_live(p_lease text,p_cancel boolean DEFAULT false,p_reconcile boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE link nanivio_balanced_malvi_pack_leases%ROWTYPE; result jsonb; used_seconds numeric; uid text;
  charged_minutes numeric; unused_credit numeric; credit_id uuid;
BEGIN
  SELECT user_id INTO uid FROM nanivio_malvi_live_leases WHERE lease_id=p_lease;
  IF uid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||uid));
    PERFORM 1 FROM nanivio_users WHERE id=uid FOR UPDATE;
  END IF;
  SELECT * INTO link FROM nanivio_balanced_malvi_pack_leases WHERE lease_id=p_lease FOR UPDATE;
  result:=nanivio_finish_malvi_live_pre_balanced(p_lease,p_cancel,p_reconcile);
  IF link.lease_id IS NULL OR link.settled THEN RETURN result; END IF;
  used_seconds:=coalesce((result->>'chargedSeconds')::numeric,0);
  charged_minutes:=round(link.seconds::numeric/60,6)-round((link.seconds-used_seconds)/60,6);
  unused_credit:=coalesce((result->>'refundedCredits')::numeric,0);
  PERFORM nanivio_balanced_usage('COMMIT',jsonb_build_object('userId',link.user_id,'eventId','malvi_pack_'||p_lease,
    'usage',jsonb_build_object(CASE link.mode WHEN 'voice' THEN 'voiceSeconds' ELSE 'avatarSeconds' END,used_seconds)));
  UPDATE nanivio_malvi_subscriptions SET
    voice_minutes_allowed=voice_minutes_allowed-CASE WHEN link.mode='voice' THEN round(link.seconds::numeric/60,6) ELSE 0 END,
    video_minutes_allowed=video_minutes_allowed-CASE WHEN link.mode='avatar' THEN round(link.seconds::numeric/60,6) ELSE 0 END,
    voice_minutes_used=greatest(0,voice_minutes_used-CASE WHEN link.mode='voice' THEN charged_minutes ELSE 0 END),
    video_minutes_used=greatest(0,video_minutes_used-CASE WHEN link.mode='avatar' THEN charged_minutes ELSE 0 END)
    WHERE subscription_id=link.subscription_id;
  UPDATE malvi_credit_accounts SET credit_balance=greatest(0,credit_balance-unused_credit),version=version+1
    WHERE user_id=link.user_id RETURNING id INTO credit_id;
  IF unused_credit>0 THEN
    INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
      VALUES(credit_id,link.user_id,'DEBIT',unused_credit,'MALVI_MINUTES','balanced_pack_unbridge_'||p_lease,
        'BALANCED_PACK',jsonb_build_object('leaseId',p_lease,'unusedSeconds',link.seconds-used_seconds));
  END IF;
  UPDATE nanivio_balanced_malvi_pack_leases SET settled=true WHERE lease_id=p_lease;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_balanced_billing_ready()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('ready',nanivio_balanced_ledger_revision()=2,'pricingVersion','balanced-2026-11')
$$;

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['nanivio_balanced_terms','nanivio_balanced_reservation_links','nanivio_balanced_pack_receipts','nanivio_balanced_malvi_pack_leases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',name);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.nanivio_capture_balanced_terms(jsonb),
  public.nanivio_refresh_balanced_terms(text),public.nanivio_fulfill_balanced_pack(jsonb),
  public.nanivio_balanced_billing_ready(),
  public.nanivio_activate_paystack_subscription(jsonb),public.nanivio_activate_paystack_malvi(jsonb),
  public.nanivio_billing_command(text,jsonb),public.nanivio_communication_access(text,jsonb),
  public.nanivio_fulfill_tron_addon(jsonb),
  public.nanivio_activate_tron_usdt_subscription(jsonb),public.nanivio_activate_tron_usdt_malvi(jsonb),
  public.nanivio_reserve_malvi_live(text,text,text,integer),public.nanivio_finish_malvi_live(text,boolean,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_refresh_balanced_terms(text),public.nanivio_fulfill_balanced_pack(jsonb),
  public.nanivio_balanced_billing_ready(),public.nanivio_activate_paystack_subscription(jsonb),
  public.nanivio_activate_paystack_malvi(jsonb),public.nanivio_billing_command(text,jsonb),
  public.nanivio_communication_access(text,jsonb),public.nanivio_fulfill_tron_addon(jsonb),
  public.nanivio_activate_tron_usdt_subscription(jsonb),public.nanivio_activate_tron_usdt_malvi(jsonb),
  public.nanivio_reserve_malvi_live(text,text,text,integer),public.nanivio_finish_malvi_live(text,boolean,boolean) TO service_role;
-- Backups remain private, not a service-role bypass around the new accounting.
REVOKE ALL ON FUNCTION public.nanivio_activate_paystack_subscription_pre_balanced(jsonb),
  public.nanivio_activate_paystack_malvi_pre_balanced(jsonb),public.nanivio_billing_command_pre_balanced(text,jsonb),
  public.nanivio_communication_access_pre_balanced(text,jsonb),public.nanivio_fulfill_tron_addon_pre_balanced(jsonb),
  public.nanivio_reserve_malvi_live_pre_balanced(text,text,text,integer),
  public.nanivio_finish_malvi_live_pre_balanced(text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.nanivio_activate_tron_usdt_subscription_pre_balanced(jsonb),
  public.nanivio_activate_tron_usdt_malvi_pre_balanced(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
SELECT true AS balanced_billing_installed;
