-- Install-only: no account is erased, deactivated or queued by this migration.
-- Service-only workflow. The application deliberately does not start a worker.
BEGIN;
CREATE TABLE public.nanivio_deletion_jobs (
  request_id uuid PRIMARY KEY REFERENCES public.nanivio_deletion_requests(id),
  owner_id text NOT NULL UNIQUE,
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object'),
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','processing','needs_attention','completed')),
  lease_token uuid, lease_until timestamptz,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.nanivio_deletion_steps (
  request_id uuid NOT NULL REFERENCES public.nanivio_deletion_jobs(request_id),
  step text NOT NULL CHECK (step IN
    ('access','billing','storage','voice','stream','personal_data','auth_identity','verification')),
  state text NOT NULL CHECK (state IN ('started','waiting','verified')),
  receipt jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(request_id,step)
);
CREATE TABLE public.nanivio_deletion_retention (
  request_id uuid NOT NULL REFERENCES public.nanivio_deletion_jobs(request_id),
  resource_table text NOT NULL CHECK (resource_table ~ '^[a-z_][a-z_0-9]+$'),
  resource_key jsonb NOT NULL CHECK (jsonb_typeof(resource_key)='object' AND resource_key<>'{}'),
  basis text NOT NULL CHECK (basis IN ('tax_ghana','tax_uae_ct','legal_claim','security_investigation')),
  review_reference text NOT NULL CHECK (length(trim(review_reference)) BETWEEN 1 AND 200),
  relevant_date date NOT NULL,
  retain_until timestamptz NOT NULL,
  hold_reference text,
  hold_review_at timestamptz,
  CHECK ((hold_reference IS NULL)=(hold_review_at IS NULL)),
  CHECK (hold_reference IS NULL OR length(trim(hold_reference)) BETWEEN 1 AND 200),
  CHECK (retain_until>relevant_date),
  CHECK (basis<>'tax_ghana' OR retain_until=(relevant_date+interval '6 years') AT TIME ZONE 'UTC'),
  CHECK (basis<>'tax_uae_ct' OR retain_until=(relevant_date+interval '7 years') AT TIME ZONE 'UTC'),
  PRIMARY KEY(request_id,resource_table,resource_key)
);
ALTER TABLE public.nanivio_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_deletion_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_deletion_retention ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_deletion_jobs,public.nanivio_deletion_steps,public.nanivio_deletion_retention FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.nanivio_deletion_jobs,public.nanivio_deletion_steps,public.nanivio_deletion_retention TO service_role;

CREATE OR REPLACE FUNCTION public.nanivio_deletion_work(
  p_request uuid,p_operation text,p_token uuid DEFAULT NULL,
  p_step text DEFAULT NULL,p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  j nanivio_deletion_jobs%ROWTYPE;
  r nanivio_deletion_requests%ROWTYPE;
  names text[] := ARRAY['access','billing','storage','voice','stream','personal_data','auth_identity','verification'];
  expected text;
  field text;
BEGIN
  IF p_operation='PREPARE' THEN
    SELECT * INTO r FROM nanivio_deletion_requests WHERE id=p_request FOR UPDATE;
    IF NOT FOUND OR r.status='completed' THEN RAISE EXCEPTION 'Verified open request required'; END IF;
    -- A draft policy is never sufficient authority to execute erasure.
    IF p_payload->'executionApproved' IS DISTINCT FROM 'true'::jsonb
      OR jsonb_typeof(p_payload->'version') IS DISTINCT FROM 'string'
      OR length(trim(p_payload->>'version')) NOT BETWEEN 1 AND 100
      THEN RAISE EXCEPTION 'Execution-approved policy required'; END IF;
    FOREACH field IN ARRAY ARRAY['legalReview','retentionSchedule','sharedContentReview',
      'billingSettlement','storageInventory','backupReview','providerInventory'] LOOP
      IF jsonb_typeof(p_payload->field) IS DISTINCT FROM 'string'
        OR coalesce(length(trim(p_payload->>field)),0) NOT BETWEEN 1 AND 200
        THEN RAISE EXCEPTION 'Reviewed policy references required'; END IF;
    END LOOP;
    IF octet_length(p_payload::text)>4096 THEN RAISE EXCEPTION 'Policy is too large'; END IF;
    INSERT INTO nanivio_deletion_jobs(request_id,owner_id,policy)
      VALUES(r.id,r.owner_id,p_payload) ON CONFLICT(request_id) DO NOTHING;
    SELECT * INTO j FROM nanivio_deletion_jobs WHERE request_id=p_request FOR UPDATE;
    IF j.owner_id<>r.owner_id OR j.policy<>p_payload THEN RAISE EXCEPTION 'Prepared review is immutable'; END IF;
    RETURN jsonb_build_object('prepared',true);
  END IF;
  SELECT * INTO j FROM nanivio_deletion_jobs WHERE request_id=p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed deletion job required'; END IF;
  IF p_operation='CLAIM' THEN
    IF p_token IS NULL THEN RAISE EXCEPTION 'Lease token required'; END IF;
    IF j.state IN ('completed','needs_attention') OR j.lease_until>clock_timestamp()
      THEN RETURN jsonb_build_object('claimed',false); END IF;
    SELECT * INTO r FROM nanivio_deletion_requests WHERE id=p_request FOR UPDATE;
    IF r.owner_id<>j.owner_id OR r.status='completed' THEN RAISE EXCEPTION 'Request identity changed'; END IF;
    UPDATE nanivio_deletion_jobs SET state='processing',lease_token=p_token,
      lease_until=clock_timestamp()+interval '2 minutes',updated_at=now() WHERE request_id=p_request;
    UPDATE nanivio_deletion_requests SET status='processing',updated_at=now() WHERE id=p_request;
    RETURN jsonb_build_object('claimed',true,'ownerId',j.owner_id,'policy',j.policy,
      'steps',coalesce((SELECT jsonb_object_agg(step,jsonb_build_object(
        'state',state,'receipt',receipt,'startedAt',started_at))
        FROM nanivio_deletion_steps WHERE request_id=p_request),'{}'::jsonb));
  END IF;
  IF p_operation='RETRY' THEN
    IF j.state<>'needs_attention' OR coalesce(length(p_payload->>'reviewReference'),0) NOT BETWEEN 1 AND 200
      THEN RAISE EXCEPTION 'Reviewed retry required'; END IF;
    -- Never discard an uncertain provider operation or verified checkpoint.
    UPDATE nanivio_deletion_jobs SET state='queued',error_code=NULL,
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE request_id=p_request;
    UPDATE nanivio_deletion_requests SET status='processing',updated_at=now() WHERE id=p_request;
    RETURN jsonb_build_object('retryPrepared',true);
  END IF;
  IF j.state<>'processing' OR j.lease_token IS DISTINCT FROM p_token
    OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Deletion lease lost'; END IF;
  SELECT n INTO expected FROM unnest(names) WITH ORDINALITY AS seq(n,pos)
    WHERE NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps s
      WHERE s.request_id=p_request AND s.step=n AND s.state='verified')
    ORDER BY pos LIMIT 1;
  IF p_operation='COMPLETE' THEN
    IF expected IS NOT NULL THEN RAISE EXCEPTION 'Cleanup remains unverified'; END IF;
    -- Recheck actual local state, not just previously saved adapter receipts.
    -- Deliberately fails closed until migration 031 is installed.
    PERFORM nanivio_deletion_clean_local(p_request,p_token,true);
    UPDATE nanivio_deletion_jobs SET state='completed',lease_token=NULL,lease_until=NULL,
      error_code=NULL,updated_at=now() WHERE request_id=p_request;
    UPDATE nanivio_deletion_requests SET status='completed',completed_at=now(),updated_at=now() WHERE id=p_request;
    RETURN jsonb_build_object('completed',true);
  END IF;
  IF p_step IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Deletion step order violation'; END IF;
  IF p_operation='START' THEN
    INSERT INTO nanivio_deletion_steps(request_id,step,state) VALUES(p_request,p_step,'started')
      ON CONFLICT(request_id,step) DO NOTHING;
    UPDATE nanivio_deletion_jobs SET lease_until=clock_timestamp()+interval '2 minutes'
      WHERE request_id=p_request;
    RETURN jsonb_build_object('started',true);
  END IF;
  IF p_operation IN ('VERIFY','WAIT') THEN
    IF NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request AND step=p_step)
      THEN RAISE EXCEPTION 'Step must be started first'; END IF;
    -- Only opaque operation references and safe evidence codes, never provider
    -- responses, emails, tokens, private content or signed storage URLs.
    IF jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>1024
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('code','operationId'))
      OR jsonb_typeof(p_payload->'code') IS DISTINCT FROM 'string'
      OR coalesce(p_payload->>'code','') !~ '^[A-Z][A-Z0-9_]{0,79}$'
      OR (p_payload ? 'operationId' AND (jsonb_typeof(p_payload->'operationId') IS DISTINCT FROM 'string'
        OR p_payload->>'operationId' !~ '^[a-zA-Z0-9_:-]{1,160}$'))
      THEN RAISE EXCEPTION 'Invalid deletion receipt'; END IF;
    IF p_operation='WAIT' AND NOT (p_payload ? 'operationId') THEN RAISE EXCEPTION 'Pending operation reference required'; END IF;
    UPDATE nanivio_deletion_steps SET state=CASE WHEN p_operation='VERIFY' THEN 'verified' ELSE 'waiting' END,
      receipt=p_payload,updated_at=now() WHERE request_id=p_request AND step=p_step;
    IF p_operation='WAIT' THEN
      UPDATE nanivio_deletion_jobs SET state='queued',lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE request_id=p_request;
    END IF;
    RETURN jsonb_build_object('saved',true);
  END IF;
  IF p_operation='FAIL' THEN
    IF jsonb_typeof(p_payload->'code') IS DISTINCT FROM 'string'
      OR p_payload->>'code' NOT IN ('CLEANUP_FAILED','REVIEW_REQUIRED','PROVIDER_OUTCOME_UNCONFIRMED','ADAPTER_UNAVAILABLE')
      OR NOT (p_payload ? 'code') THEN RAISE EXCEPTION 'Invalid failure code'; END IF;
    UPDATE nanivio_deletion_jobs SET state='needs_attention',error_code=p_payload->>'code',
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE request_id=p_request;
    UPDATE nanivio_deletion_requests SET status='needs_attention',updated_at=now() WHERE id=p_request;
    RETURN jsonb_build_object('blocked',true);
  END IF;
  RAISE EXCEPTION 'Unknown deletion operation';
END $$;
REVOKE ALL ON FUNCTION public.nanivio_deletion_work(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_deletion_work(uuid,text,uuid,text,jsonb) TO service_role;
COMMIT;
SELECT true AS account_deletion_fulfillment_installed;
