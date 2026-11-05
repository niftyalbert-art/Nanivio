-- Direct, watch-only TRON USDT checkout. Requires billing migrations 008, 014, 021.
-- No Paystack function, wallet balance, or existing purchase is modified.
-- Copy the installed external-payment activation rules into a separate TRON
-- namespace, preserving purchased allowances and the installed schema version.
DO $$
DECLARE source_name text; target_name text; definition text;
BEGIN
  FOREACH source_name IN ARRAY ARRAY['nanivio_activate_paystack_subscription','nanivio_activate_paystack_malvi'] LOOP
    target_name := replace(source_name,'paystack','tron_usdt');
    definition := pg_get_functiondef((('public.' || source_name || '(jsonb)')::regprocedure));
    definition := replace(definition,source_name,target_name);
    definition := replace(definition,'''paystack''','''tron_usdt''');
    definition := replace(definition,'nanivio-paystack:','nanivio-tron-usdt:');
    definition := replace(definition,'Paystack','TRON USDT');
    definition := replace(definition,'PAYSTACK','TRON_USDT');
    definition := replace(definition,'''GHS'',''USD''','''GHS'',''USD'',''USDT''');
    EXECUTE definition;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated',target_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role',target_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.nanivio_tron_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  receiving_address text NOT NULL,
  amount_units bigint NOT NULL CHECK(amount_units > 0 AND amount_units <= 100000000000),
  purchase jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REVIEW','ACTIVATED')),
  proof jsonb,
  activation jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '20 minutes',
  next_check_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Never recycle an amount at this receiving address, even after expiry.
  UNIQUE(receiving_address,amount_units)
);
CREATE INDEX IF NOT EXISTS nanivio_tron_invoices_user ON public.nanivio_tron_invoices(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.nanivio_tron_receipts (
  transaction_id text NOT NULL CHECK(transaction_id ~ '^[a-f0-9]{64}$'),
  log_index integer NOT NULL CHECK(log_index >= 0),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.nanivio_tron_invoices(id),
  PRIMARY KEY(transaction_id,log_index)
);
ALTER TABLE public.nanivio_tron_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_tron_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_tron_invoices,public.nanivio_tron_receipts FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.nanivio_tron_usdt_command(command text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  invoice public.nanivio_tron_invoices%ROWTYPE;
  purchase jsonb;
  product jsonb;
  base_units bigint;
  candidate bigint;
  transfer_proof jsonb := payload->'proof';
  claim public.nanivio_tron_receipts%ROWTYPE;
  result jsonb;
  rows jsonb;
  late boolean;
  uid text := nullif(payload->>'userId','');
BEGIN
  IF command='PREFLIGHT' THEN
    PERFORM public.nanivio_activate_tron_usdt_subscription('{"preflight":true}'::jsonb);
    PERFORM public.nanivio_activate_tron_usdt_malvi('{"preflight":true}'::jsonb);
    RETURN '{"success":true}'::jsonb;
  ELSIF command='LIST' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO rows FROM (
      SELECT * FROM nanivio_tron_invoices WHERE uid IS NULL OR user_id=uid ORDER BY created_at DESC LIMIT 100
    ) t;
    RETURN jsonb_build_object('success',true,'invoices',rows);
  ELSIF command='GET' THEN
    SELECT * INTO STRICT invoice FROM nanivio_tron_invoices WHERE id=(payload->>'id')::uuid;
    RETURN jsonb_build_object('success',true,'invoice',to_jsonb(invoice));
  ELSIF command='QUEUE' THEN
    WITH due AS (
      SELECT id FROM nanivio_tron_invoices
      WHERE status='PENDING' AND created_at>now()-interval '24 hours' AND next_check_at<=now()
      ORDER BY next_check_at LIMIT 10 FOR UPDATE SKIP LOCKED
    ), leased AS (
      UPDATE nanivio_tron_invoices SET next_check_at=now()+interval '5 minutes'
      WHERE id IN (SELECT id FROM due) RETURNING *
    ) SELECT coalesce(jsonb_agg(to_jsonb(leased)),'[]'::jsonb) INTO rows FROM leased;
    RETURN jsonb_build_object('success',true,'invoices',rows);
  ELSIF command='CREATE' THEN
    purchase := payload->'purchase';
    IF uid IS NULL OR purchase->>'purpose' NOT IN ('SUBSCRIPTION','MALVI_SUBSCRIPTION')
      OR purchase->>'billingCycle' NOT IN ('MONTHLY','ANNUAL')
      OR purchase->>'currency'<>'USD' OR nullif(purchase->'product'->>'id','') IS NULL
      OR payload->>'receivingAddress' !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      OR (purchase->>'amount')::numeric<=0 OR (purchase->>'amount')::numeric>100000 THEN
      RAISE EXCEPTION 'Invalid server-priced TRON purchase';
    END IF;
    PERFORM public.nanivio_tron_usdt_command('PREFLIGHT','{}'::jsonb);
    PERFORM pg_advisory_xact_lock(hashtext('tron-invoice-user:'||uid));
    IF (SELECT count(*) FROM nanivio_tron_invoices WHERE user_id=uid AND status='PENDING' AND expires_at>now())>=3 THEN
      RAISE EXCEPTION 'Use an existing open invoice before creating another';
    END IF;
    base_units := round((purchase->>'amount')::numeric*1000000);
    IF base_units<10000 OR base_units%10000<>0 THEN RAISE EXCEPTION 'A cent-priced plan is required'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('tron-invoice-amount:'||(payload->>'receivingAddress')||':'||base_units));
    SELECT base_units-n INTO candidate FROM generate_series(1,9999) n
    WHERE NOT EXISTS (SELECT 1 FROM nanivio_tron_invoices WHERE receiving_address=payload->>'receivingAddress' AND amount_units=base_units-n)
    ORDER BY random() LIMIT 1;
    IF candidate IS NULL THEN RAISE EXCEPTION 'Invoice matching capacity exhausted; rotate the receiving address'; END IF;
    INSERT INTO nanivio_tron_invoices(user_id,receiving_address,amount_units,purchase)
      VALUES(uid,payload->>'receivingAddress',candidate,purchase) RETURNING * INTO invoice;
    RETURN jsonb_build_object('success',true,'invoice',to_jsonb(invoice));
  ELSIF command='CONFIRM' THEN
    SELECT * INTO STRICT invoice FROM nanivio_tron_invoices WHERE id=(payload->>'id')::uuid FOR UPDATE;
    IF invoice.status='ACTIVATED' THEN
      RETURN jsonb_build_object('success',true,'invoice',to_jsonb(invoice),'alreadyFulfilled',true);
    END IF;
    IF transfer_proof IS NULL OR NOT transfer_proof ?& ARRAY['tokenContract','receivingAddress','amountUnits','transactionId','logIndex','blockNumber','blockTimestamp']
      OR EXISTS (SELECT 1 FROM jsonb_each(transfer_proof) entry WHERE entry.value='null'::jsonb) THEN
      RAISE EXCEPTION 'Complete blockchain proof is required';
    END IF;
    IF transfer_proof->>'tokenContract' IS DISTINCT FROM 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      OR transfer_proof->>'receivingAddress' IS DISTINCT FROM invoice.receiving_address
      OR (transfer_proof->>'amountUnits')::bigint IS DISTINCT FROM invoice.amount_units
      OR transfer_proof->>'transactionId' !~ '^[a-f0-9]{64}$'
      OR (transfer_proof->>'logIndex')::integer<0 OR (transfer_proof->>'blockNumber')::bigint<=0
      OR to_timestamp((transfer_proof->>'blockTimestamp')::numeric/1000)<invoice.created_at
      OR to_timestamp((transfer_proof->>'blockTimestamp')::numeric/1000)>now()+interval '30 seconds'
      OR nullif(payload->>'actorId','') IS NULL THEN
      RAISE EXCEPTION 'Verified solidified TRON proof does not match this invoice';
    END IF;
    -- The RPC is service-role only: proof must come from server Solidity verification.
    INSERT INTO nanivio_tron_receipts(transaction_id,log_index,invoice_id)
      VALUES(transfer_proof->>'transactionId',(transfer_proof->>'logIndex')::integer,invoice.id)
      ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT claim FROM nanivio_tron_receipts WHERE invoice_id=invoice.id;
    IF claim.transaction_id<>transfer_proof->>'transactionId' OR claim.log_index<>(transfer_proof->>'logIndex')::integer THEN
      RAISE EXCEPTION 'This invoice already has a different transfer';
    END IF;
    late := to_timestamp((transfer_proof->>'blockTimestamp')::numeric/1000)>invoice.expires_at;
    IF late AND coalesce((payload->>'acceptLate')::boolean,false)=false THEN
      UPDATE nanivio_tron_invoices SET status='REVIEW',proof=transfer_proof,updated_at=now() WHERE id=invoice.id RETURNING * INTO invoice;
      RETURN jsonb_build_object('success',true,'invoice',to_jsonb(invoice));
    END IF;
    purchase := invoice.purchase;
    product := purchase->'product';
    result := jsonb_build_object(
      'userId',invoice.user_id,'referenceId','NV-TRON-'||invoice.id,
      'transactionId','tx_tron_'||invoice.id,'subscriptionId','tron_'||invoice.id,
      'planId',product->>'id','tier',product->>'tier','planName',product->>'name',
      'billingCycle',purchase->>'billingCycle','periodDays',(product->>'periodDays')::integer,
      'price',invoice.amount_units::numeric/1000000,'currency','USDT',
      'langpretationQuota',product->'langpretationQuota','voiceQuota',product->'voiceQuota',
      'malviQuota',product->'malviQuota','voiceMinutesAllowed',product->'voiceMinutesAllowed',
      'videoMinutesAllowed',product->'videoMinutesAllowed',
      'metadata',jsonb_build_object('source','tron_usdt','network','TRON','proof',transfer_proof,
        'catalogVersion',product->'catalogVersion','planSnapshot',product->'planSnapshot'));
    IF purchase->>'purpose'='MALVI_SUBSCRIPTION' THEN
      result := public.nanivio_activate_tron_usdt_malvi(result);
    ELSE
      result := public.nanivio_activate_tron_usdt_subscription(result);
    END IF;
    IF coalesce((result->>'success')::boolean,false)=false THEN RAISE EXCEPTION 'Subscription activation failed'; END IF;
    UPDATE nanivio_tron_invoices SET status='ACTIVATED',proof=transfer_proof,
      activation=jsonb_build_object('message',product->>'name'||' activated. Your purchased allowances are ready. Renew manually before your term ends.'),
      updated_at=now() WHERE id=invoice.id RETURNING * INTO invoice;
    INSERT INTO nanivio_billing_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(payload->>'actorId',CASE WHEN late THEN 'TRON_LATE_PAYMENT_APPROVED' ELSE 'TRON_SUBSCRIPTION_ACTIVATED' END,
        'CRYPTO_INVOICE',invoice.id::text,transfer_proof);
    RETURN jsonb_build_object('success',true,'invoice',to_jsonb(invoice));
  END IF;
  RAISE EXCEPTION 'Unknown TRON billing command';
END $$;
REVOKE ALL ON FUNCTION public.nanivio_tron_usdt_command(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_tron_usdt_command(text,jsonb) TO service_role;
