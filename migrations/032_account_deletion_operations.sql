-- Install only, after 029, 030, 031 and the existing billing/storage migrations.
-- No worker is enabled; no account is frozen or erased by installation.
BEGIN;
CREATE TABLE public.nanivio_deletion_operation_reviews (
  request_id uuid PRIMARY KEY REFERENCES public.nanivio_deletion_jobs(request_id),
  billing_digest text,
  billing_reference text CHECK(length(trim(billing_reference)) BETWEEN 1 AND 200),
  storage_inventory jsonb,
  storage_reference text CHECK(length(trim(storage_reference)) BETWEEN 1 AND 200),
  -- Provider evidence contains reviewed absolute expiry/revocation times, not
  -- bearer tokens. Never invent a lifetime for a legacy session token.
  access_evidence jsonb,
  access_reference text CHECK(length(trim(access_reference)) BETWEEN 1 AND 200),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nanivio_deletion_jobs ADD COLUMN frozen_at timestamptz;
ALTER TABLE public.nanivio_deletion_operation_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_deletion_operation_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.nanivio_deletion_operation_reviews TO service_role;

-- Private inventory, including unknown billing states. Missing required tables
-- fail closed rather than being mistaken for an empty account.
CREATE OR REPLACE FUNCTION public.nanivio_deletion_billing_inventory(uid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t text; rows jsonb; result jsonb:='{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['nanivio_subscriptions','nanivio_malvi_subscriptions',
    'nanivio_wallets','nanivio_credit_accounts','malvi_credit_accounts',
    'nanivio_payments','nanivio_refunds','nanivio_disputes',
    'nanivio_paystack_orders','nanivio_tron_invoices'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Billing inventory incomplete'; END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(v ORDER BY v::text),''[]''::jsonb)
      FROM (SELECT to_jsonb(r) AS v FROM public.%I r WHERE user_id=$1) q',t) INTO rows USING uid;
    result:=result||jsonb_build_object(t,rows);
  END LOOP;
  SELECT result||jsonb_build_object('profileBalances',
    jsonb_build_object('ghs',wallet_balance_ghs,'usd',wallet_balance_usd))
    INTO result FROM nanivio_users WHERE id=uid;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_deletion_storage_inventory(uid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE files jsonb; profile_avatar text;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.object_id),'[]'::jsonb) INTO files
    FROM nanivio_plan_stored_objects f WHERE user_id=uid;
  SELECT avatar INTO profile_avatar FROM nanivio_users WHERE id=uid;
  RETURN jsonb_build_object('files',files,'avatar',profile_avatar);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_deletion_operations(
  p_request uuid,p_token uuid,p_action text,p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j nanivio_deletion_jobs%ROWTYPE; review nanivio_deletion_operation_reviews%ROWTYPE;
  inventory jsonb; entry jsonb; t text; provider text; deadline timestamptz; last_deadline timestamptz;
  file_row nanivio_plan_stored_objects%ROWTYPE; uid text; profile_status text;
BEGIN
  SELECT * INTO j FROM nanivio_deletion_jobs WHERE request_id=p_request FOR UPDATE;
  IF NOT FOUND OR j.state<>'processing' OR j.lease_token IS DISTINCT FROM p_token
    OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Deletion lease lost'; END IF;
  uid:=j.owner_id;
  SELECT status INTO profile_status FROM nanivio_users WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deletion owner missing'; END IF;
  SELECT * INTO review FROM nanivio_deletion_operation_reviews WHERE request_id=p_request;

  IF p_action='FREEZE' THEN
    IF NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step='access' AND state IN ('started','waiting')) THEN RAISE EXCEPTION 'Access intent required'; END IF;
    IF j.frozen_at IS NULL THEN
      UPDATE nanivio_users SET status='DEACTIVATED',updated_at=clock_timestamp() WHERE id=uid;
      UPDATE nanivio_deletion_jobs SET frozen_at=clock_timestamp() WHERE request_id=p_request;
    ELSIF profile_status<>'DEACTIVATED' THEN RAISE EXCEPTION 'Frozen identity changed'; END IF;
    RETURN '{"frozen":true}';
  END IF;
  IF j.frozen_at IS NULL OR profile_status<>'DEACTIVATED' THEN RAISE EXCEPTION 'Account freeze required'; END IF;

  IF p_action IN ('ACCESS','VERIFY') THEN
    IF review.access_reference IS NULL OR jsonb_typeof(review.access_evidence) IS DISTINCT FROM 'object'
      THEN RETURN '{"reviewRequired":true}'; END IF;
    FOREACH provider IN ARRAY ARRAY['agora','stream','azure','liveavatar','palabra','gemini'] LOOP
      entry:=review.access_evidence->provider;
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
        OR jsonb_typeof(entry->'reference') IS DISTINCT FROM 'string'
        OR length(trim(entry->>'reference')) NOT BETWEEN 1 AND 200
        OR jsonb_typeof(entry->'issuanceStoppedAt') IS DISTINCT FROM 'string'
        OR jsonb_typeof(entry->'notAfter') IS DISTINCT FROM 'string'
        THEN RETURN '{"reviewRequired":true}'; END IF;
      -- Issuance must already have stopped, including any in-flight requests.
      -- The operator must establish this from provider/session evidence.
      IF (entry->>'issuanceStoppedAt')::timestamptz<j.frozen_at
        OR (entry->>'issuanceStoppedAt')::timestamptz>clock_timestamp()
        THEN RETURN '{"reviewRequired":true}'; END IF;
      deadline:=(entry->>'notAfter')::timestamptz;
      IF NOT isfinite(deadline) THEN RETURN '{"reviewRequired":true}'; END IF;
      last_deadline:=greatest(last_deadline,deadline);
    END LOOP;
    IF last_deadline>clock_timestamp() THEN RETURN '{"pending":true}'; END IF;
    IF p_action='ACCESS' THEN RETURN '{"verified":true}'; END IF;
  END IF;

  IF p_action IN ('BILLING','BILLING_INVENTORY','VERIFY') THEN
    IF NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step='access' AND state='verified') THEN RAISE EXCEPTION 'Access cleanup required'; END IF;
    -- Stop local renewal flags before review, but never zero funds, claim a
    -- remote subscription was cancelled, or erase a payment/refund.
    UPDATE nanivio_subscriptions SET auto_renew=false WHERE user_id=uid AND auto_renew;
    UPDATE nanivio_malvi_subscriptions SET auto_renew=false WHERE user_id=uid AND auto_renew;
    inventory:=nanivio_deletion_billing_inventory(uid);
    IF p_action='BILLING_INVENTORY' THEN
      RETURN jsonb_build_object('digest',md5(inventory::text),'inventory',inventory);
    END IF;
    IF review.billing_reference IS NULL OR review.billing_digest IS DISTINCT FROM md5(inventory::text)
      THEN RETURN '{"reviewRequired":true}'; END IF;
    -- Even a signed review cannot silently forfeit a nonzero balance.
    IF coalesce((inventory->'profileBalances'->>'ghs')::numeric,0)<>0
      OR coalesce((inventory->'profileBalances'->>'usd')::numeric,0)<>0 THEN RETURN '{"reviewRequired":true}'; END IF;
    FOREACH t IN ARRAY ARRAY['nanivio_wallets','nanivio_credit_accounts','malvi_credit_accounts'] LOOP
      FOR entry IN SELECT value FROM jsonb_array_elements(inventory->t) LOOP
        IF coalesce((entry->>'available')::numeric,0)<>0 OR coalesce((entry->>'reserved')::numeric,0)<>0
          OR coalesce((entry->>'promotional')::numeric,0)<>0 OR coalesce((entry->>'held')::numeric,0)<>0
          OR coalesce((entry->>'balance')::numeric,0)<>0 OR coalesce((entry->>'credit_balance')::numeric,0)<>0
          THEN RETURN '{"reviewRequired":true}'; END IF;
      END LOOP;
    END LOOP;
    FOREACH t IN ARRAY ARRAY['nanivio_payments','nanivio_refunds','nanivio_disputes',
      'nanivio_paystack_orders','nanivio_tron_invoices'] LOOP
      FOR entry IN SELECT value FROM jsonb_array_elements(inventory->t) LOOP
        IF upper(coalesce(entry->>'status','')) NOT IN
          ('COMPLETED','PAID','SUCCESS','SUCCESSFUL','FAILED','CANCELLED','CANCELED','EXPIRED',
           'REJECTED','RESOLVED','REFUNDED','PROCESSED','ACTIVATED')
          THEN RETURN '{"reviewRequired":true}'; END IF;
      END LOOP;
    END LOOP;
    -- External renewal cancellation/refund/paid-term disposition evidence must
    -- be reviewed for this exact inventory. A local flag isn't remote proof.
    IF p_action='BILLING' THEN RETURN '{"verified":true}'; END IF;
  END IF;

  IF p_action IN ('STORAGE','FILE_REMOVED','VERIFY') THEN
    IF NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step='billing' AND state='verified') THEN RAISE EXCEPTION 'Billing settlement required'; END IF;
    inventory:=nanivio_deletion_storage_inventory(uid);
    IF review.storage_reference IS NULL OR jsonb_typeof(review.storage_inventory->'files') IS DISTINCT FROM 'array'
      THEN RETURN '{"reviewed":false}'; END IF;
    -- Only an exact reviewed object may be removed. New/changed files, pending
    -- uploads, business JSON and cross-owner URL reuse require a fresh review.
    FOR entry IN SELECT value FROM jsonb_array_elements(inventory->'files') LOOP
      IF NOT (review.storage_inventory->'files' @> jsonb_build_array(entry))
        OR entry->>'kind'<>'chat' OR entry->>'state'<>'STORED'
        OR coalesce(entry->>'url','')='' OR coalesce(entry->>'channel_id','')=''
        OR EXISTS(SELECT 1 FROM nanivio_plan_stored_objects f WHERE f.user_id<>uid AND f.url=entry->>'url')
        THEN RETURN '{"reviewed":false}'; END IF;
    END LOOP;
    IF nullif(inventory->>'avatar','') IS NOT NULL
      AND (inventory->'avatar') IS DISTINCT FROM (review.storage_inventory->'avatar')
      THEN RETURN '{"reviewed":false}'; END IF;
    IF p_action='FILE_REMOVED' THEN
      SELECT * INTO file_row FROM nanivio_plan_stored_objects
        WHERE object_id=p_payload->>'objectId' AND user_id=uid FOR UPDATE;
      IF NOT FOUND OR file_row.url IS DISTINCT FROM p_payload->>'url' THEN
        RAISE EXCEPTION 'Owned file changed';
      END IF;
      DELETE FROM nanivio_plan_stored_objects WHERE object_id=file_row.object_id AND user_id=uid;
      RETURN '{"removed":true}';
    END IF;
    IF p_action='STORAGE' THEN RETURN jsonb_build_object('reviewed',true,'files',inventory->'files'); END IF;
    IF jsonb_array_length(inventory->'files')<>0 THEN RETURN '{"verified":false}'; END IF;
    RETURN '{"verified":true}';
  END IF;
  RAISE EXCEPTION 'Unknown deletion operation';
END $$;

-- A frozen owner must not receive a new/renewed paid subscription from a late
-- request. Existing settlement records remain writable for finance review.
CREATE OR REPLACE FUNCTION public.nanivio_deletion_renewal_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN RAISE EXCEPTION 'Subscription ownership cannot be reassigned'; END IF;
  SELECT status INTO s FROM nanivio_users WHERE id=NEW.user_id FOR SHARE;
  IF s IS DISTINCT FROM 'ACTIVE' AND EXISTS(SELECT 1 FROM nanivio_deletion_jobs
    WHERE owner_id=NEW.user_id AND frozen_at IS NOT NULL) AND
    (TG_OP='INSERT' OR NEW.auto_renew OR
     NEW.current_period_end IS DISTINCT FROM OLD.current_period_end OR NEW.user_id IS DISTINCT FROM OLD.user_id)
    THEN RAISE EXCEPTION 'Renewal blocked during erasure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deletion_renewal_fence BEFORE INSERT OR UPDATE ON nanivio_subscriptions
  FOR EACH ROW EXECUTE FUNCTION nanivio_deletion_renewal_fence();
CREATE TRIGGER deletion_renewal_fence BEFORE INSERT OR UPDATE ON nanivio_malvi_subscriptions
  FOR EACH ROW EXECUTE FUNCTION nanivio_deletion_renewal_fence();
CREATE TRIGGER deletion_owner_fence BEFORE INSERT OR UPDATE ON nanivio_plan_stored_objects
  FOR EACH ROW EXECUTE FUNCTION nanivio_private_owner_active();

-- Completion cannot bypass operational verification by writing success
-- receipts directly. Recheck the actual current state in the same transaction.
CREATE OR REPLACE FUNCTION public.nanivio_deletion_completion_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NEW.state='completed' AND OLD.state<>'completed' THEN
    result:=nanivio_deletion_operations(OLD.request_id,OLD.lease_token,'VERIFY');
    IF result->'verified' IS DISTINCT FROM 'true'::jsonb
      THEN RAISE EXCEPTION 'Operational deletion verification required'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deletion_completion_fence BEFORE UPDATE ON nanivio_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION nanivio_deletion_completion_fence();
REVOKE ALL ON FUNCTION nanivio_deletion_operations(uuid,uuid,text,jsonb),
  nanivio_deletion_billing_inventory(text),nanivio_deletion_storage_inventory(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nanivio_deletion_operations(uuid,uuid,text,jsonb),
  nanivio_deletion_billing_inventory(text),nanivio_deletion_storage_inventory(text) TO service_role;
COMMIT;
SELECT true AS account_deletion_operations_installed;
