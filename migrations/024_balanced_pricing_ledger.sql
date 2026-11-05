-- Staged accounting for the approved balanced-pricing proposal.
-- Installing this does NOT publish prices, modify subscriptions, refill trials,
-- debit wallets, or grant benefits. Existing billing paths remain unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nanivio_pricing_grants (
  grant_id text PRIMARY KEY,
  user_id text NOT NULL,
  payment_reference text NOT NULL UNIQUE,
  snapshot jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nanivio_pricing_grant_owner ON public.nanivio_pricing_grants(user_id);
CREATE TABLE IF NOT EXISTS public.nanivio_pricing_consumption (
  grant_id text NOT NULL REFERENCES public.nanivio_pricing_grants(grant_id),
  allocation integer NOT NULL CHECK(allocation BETWEEN 0 AND 11),
  resource text NOT NULL CHECK(resource IN ('callSeconds','translationUnits','textRequests','textCharacters',
    'voiceSeconds','avatarSeconds','searchQueries')),
  used bigint NOT NULL DEFAULT 0 CHECK(used>=0),
  PRIMARY KEY(grant_id,allocation,resource)
);
CREATE TABLE IF NOT EXISTS public.nanivio_pricing_usage_events (
  event_id text PRIMARY KEY,
  user_id text NOT NULL,
  requested jsonb NOT NULL,
  debits jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('RESERVED','COMMITTED','RELEASED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nanivio_pricing_usage_owner ON public.nanivio_pricing_usage_events(user_id,status,expires_at);
CREATE TABLE IF NOT EXISTS public.nanivio_pricing_storage_objects (
  object_id text PRIMARY KEY,
  user_id text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Explicit UTC arithmetic avoids session timezone and daylight-saving changes.
CREATE OR REPLACE FUNCTION public.nanivio_pricing_allocation(s jsonb,started timestamptz,at_time timestamptz)
RETURNS TABLE(allocation integer,starts_at timestamptz,ends_at timestamptz)
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i integer; a timestamptz; b timestamptz;
BEGIN
  IF s->>'kind'='pack' OR s->>'cycle'='MONTHLY' THEN
    IF at_time>=started AND at_time<started+interval '720 hours' THEN
      RETURN QUERY SELECT 0,started,started+interval '720 hours';
    END IF;
  ELSIF s->>'kind'='subscription' AND s->>'cycle'='ANNUAL' AND (s->>'allocations')::int=12 THEN
    FOR i IN 0..11 LOOP
      a:=((started AT TIME ZONE 'UTC')+make_interval(months=>i)) AT TIME ZONE 'UTC';
      b:=((started AT TIME ZONE 'UTC')+make_interval(months=>i+1)) AT TIME ZONE 'UTC';
      IF at_time>=a AND at_time<b THEN RETURN QUERY SELECT i,a,b; RETURN; END IF;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_validate_pricing_snapshot(s jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE r text; v jsonb; n numeric;
BEGIN
  IF s IS NULL OR jsonb_typeof(s)<>'object'
    OR s->>'schemaVersion' IS DISTINCT FROM '1'
    OR s->>'pricingVersion' IS DISTINCT FROM 'balanced-2026-11'
    OR coalesce(s->>'kind','') NOT IN ('subscription','pack')
    OR coalesce(s->>'family','') NOT IN ('malvi','communication')
    OR coalesce(length(s->>'productId'),0) NOT BETWEEN 1 AND 100
    OR coalesce(length(s->>'productName'),0) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(s->'pooled') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(s->'priceCentsUSD') IS DISTINCT FROM 'number'
    OR (s->>'priceCentsUSD')::numeric<=0 OR (s->>'priceCentsUSD')::numeric<>trunc((s->>'priceCentsUSD')::numeric)
    OR jsonb_typeof(s->'limits') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(s->'limits'))<>8 THEN
    RAISE EXCEPTION 'Invalid purchased-benefit snapshot';
  END IF;
  IF s->>'kind'='subscription' THEN
    IF coalesce(s->>'cycle','') NOT IN ('MONTHLY','ANNUAL')
      OR s->>'allocations' IS DISTINCT FROM (CASE WHEN s->>'cycle'='ANNUAL' THEN '12' ELSE '1' END)
      OR s->'validityDays' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Invalid subscription allocation'; END IF;
  ELSIF s->'cycle' IS DISTINCT FROM 'null'::jsonb OR s->>'allocations' IS DISTINCT FROM '1'
    OR s->>'validityDays' IS DISTINCT FROM '30' THEN RAISE EXCEPTION 'Invalid pack validity'; END IF;
  FOREACH r IN ARRAY ARRAY['callSeconds','translationUnits','textRequests','textCharacters','voiceSeconds','avatarSeconds','searchQueries','storageBytes'] LOOP
    v:=s->'limits'->r;
    IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid resource allowance'; END IF;
    n:=(v#>>'{}')::numeric;
    IF n<0 OR n>9007199254740991 OR n<>trunc(n) THEN RAISE EXCEPTION 'Invalid resource allowance'; END IF;
  END LOOP;
END $$;

-- This private service-role API is a staged accounting primitive. GRANT must
-- only be invoked inside verified payment fulfilment, never by a browser.
-- No public checkout uses this API until every integration passes release review.
CREATE OR REPLACE FUNCTION public.nanivio_balanced_usage(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE
  uid text:=nullif(payload->>'userId','');
  eid text:=nullif(payload->>'eventId','');
  g nanivio_pricing_grants%ROWTYPE;
  e nanivio_pricing_usage_events%ROWTYPE;
  old_event record; row record; part jsonb;
  request jsonb:=payload->'usage';
  total jsonb:='{}'; debits jsonb:='[]';
  resource text; n numeric; available bigint; left_to_take bigint; take bigint;
  owner text; old_size bigint; storage bigint; capacity bigint; allocation_end timestamptz;
  reserved_end timestamptz; keep bigint; refund bigint; settled_debits jsonb:='[]';
  settled_usage jsonb; budget jsonb; quota jsonb:='{}';
BEGIN
  IF uid IS NULL OR length(uid)>128 THEN RAISE EXCEPTION 'An authenticated allowance owner is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('balanced-usage:'||uid));
  IF action='GRANT' THEN
    PERFORM nanivio_validate_pricing_snapshot(payload->'snapshot');
    IF coalesce(length(payload->>'grantId'),0) NOT BETWEEN 1 AND 160
      OR coalesce(length(payload->>'reference'),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid purchase identity'; END IF;
    SELECT * INTO g FROM nanivio_pricing_grants WHERE payment_reference=payload->>'reference';
    IF FOUND THEN
      IF g.user_id<>uid OR g.snapshot<>payload->'snapshot' OR g.grant_id<>payload->>'grantId' THEN
        RAISE EXCEPTION 'Purchase retry conflicts with the original snapshot';
      END IF;
      RETURN jsonb_build_object('success',true,'alreadyGranted',true,'grantId',g.grant_id);
    END IF;
    INSERT INTO nanivio_pricing_grants(grant_id,user_id,payment_reference,snapshot)
      VALUES(payload->>'grantId',uid,payload->>'reference',payload->'snapshot');
    RETURN jsonb_build_object('success',true,'grantId',payload->>'grantId');
  END IF;

  -- Release abandoned jobs against their ORIGINAL allocation. Never subtract
  -- last month's reservation from this month's newly available usage.
  FOR old_event IN SELECT * FROM nanivio_pricing_usage_events
    WHERE user_id=uid AND status='RESERVED' AND expires_at<=now() FOR UPDATE
  LOOP
    FOR part IN SELECT value FROM jsonb_array_elements(old_event.debits) LOOP
      UPDATE nanivio_pricing_consumption c SET used=c.used-(part->>'amount')::bigint
        WHERE c.grant_id=part->>'grantId' AND c.allocation=(part->>'allocation')::int AND c.resource=part->>'resource';
    END LOOP;
    UPDATE nanivio_pricing_usage_events SET status='RELEASED' WHERE event_id=old_event.event_id;
  END LOOP;
  IF action IN ('COMMIT','RELEASE') THEN
    SELECT * INTO e FROM nanivio_pricing_usage_events WHERE event_id=eid FOR UPDATE;
    IF NOT FOUND OR e.user_id<>uid THEN RAISE EXCEPTION 'Usage event not found for this account'; END IF;
    IF e.status='RELEASED' AND action='COMMIT' THEN
      RETURN '{"success":false,"code":"USAGE_RESERVATION_EXPIRED"}'::jsonb;
    END IF;
    IF e.status<>'RESERVED' THEN RETURN '{"success":true,"alreadyFinalized":true}'::jsonb; END IF;
    IF action='RELEASE' THEN
      FOR part IN SELECT value FROM jsonb_array_elements(e.debits) LOOP
        UPDATE nanivio_pricing_consumption c SET used=c.used-(part->>'amount')::bigint
          WHERE c.grant_id=part->>'grantId' AND c.allocation=(part->>'allocation')::int AND c.resource=part->>'resource';
      END LOOP;
    ELSIF payload->'usage' IS NOT NULL THEN
      settled_usage:=payload->'usage';
      IF jsonb_typeof(settled_usage)<>'object' OR settled_usage='{}'::jsonb THEN RAISE EXCEPTION 'Invalid settled usage'; END IF;
      FOR resource,n IN SELECT key,value::text::numeric FROM jsonb_each(settled_usage) LOOP
        IF e.requested->resource IS NULL OR n<0 OR n<>trunc(n) OR n>(e.requested->>resource)::numeric THEN
          RAISE EXCEPTION 'Invalid settled usage';
        END IF;
      END LOOP;
      budget:=e.requested||settled_usage;
      FOR part IN SELECT value FROM jsonb_array_elements(e.debits) LOOP
        resource:=part->>'resource';
        keep:=least((part->>'amount')::bigint,(budget->>resource)::bigint);
        refund:=(part->>'amount')::bigint-keep;
        UPDATE nanivio_pricing_consumption c SET used=c.used-refund
          WHERE c.grant_id=part->>'grantId' AND c.allocation=(part->>'allocation')::int AND c.resource=resource;
        budget:=jsonb_set(budget,ARRAY[resource],to_jsonb((budget->>resource)::bigint-keep));
        settled_debits:=settled_debits||jsonb_build_array(part||jsonb_build_object('amount',keep));
      END LOOP;
      UPDATE nanivio_pricing_usage_events SET debits=settled_debits WHERE event_id=eid;
    END IF;
    UPDATE nanivio_pricing_usage_events SET status=CASE WHEN action='COMMIT' THEN 'COMMITTED' ELSE 'RELEASED' END WHERE event_id=eid;
    RETURN '{"success":true}'::jsonb;
  END IF;

  -- Gather all active purchased pools. A seat never creates another grant.
  FOR row IN SELECT p.grant_id,p.snapshot,a.allocation,a.ends_at
    FROM nanivio_pricing_grants p CROSS JOIN LATERAL nanivio_pricing_allocation(p.snapshot,p.started_at,now()) a
    WHERE p.user_id=uid
  LOOP
    allocation_end:=least(coalesce(allocation_end,row.ends_at),row.ends_at);
    FOR resource,n IN SELECT key,value::text::numeric FROM jsonb_each(row.snapshot->'limits') LOOP
      quota:=jsonb_set(quota,ARRAY[resource],to_jsonb(coalesce((quota->>resource)::bigint,0)+n::bigint));
      SELECT c.used INTO available FROM nanivio_pricing_consumption c
        WHERE c.grant_id=row.grant_id AND c.allocation=row.allocation AND c.resource=resource;
      total:=jsonb_set(total,ARRAY[resource],to_jsonb(coalesce((total->>resource)::bigint,0)+n::bigint-coalesce(available,0)));
    END LOOP;
  END LOOP;
  -- Stored files persist across monthly boundaries. They are not monthly
  -- consumption that can reset while the old files still occupy storage.
  SELECT coalesce(sum(size_bytes),0) INTO storage FROM nanivio_pricing_storage_objects WHERE user_id=uid;
  capacity:=coalesce((total->>'storageBytes')::bigint,0);
  total:=jsonb_set(total,'{storageBytes}',to_jsonb(greatest(0,capacity-storage)));
  IF action='ACCESS' THEN
    RETURN jsonb_build_object('success',true,'remaining',total,'quota',quota,'storageBytesUsed',storage,'nextBoundary',allocation_end);
  END IF;
  IF action IN ('STORAGE_PUT','STORAGE_DELETE') THEN
    IF coalesce(length(payload->>'objectId'),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid stored object'; END IF;
    SELECT user_id,size_bytes INTO owner,old_size FROM nanivio_pricing_storage_objects WHERE object_id=payload->>'objectId' FOR UPDATE;
    IF FOUND AND owner<>uid THEN RAISE EXCEPTION 'Stored object belongs to another account'; END IF;
    IF action='STORAGE_DELETE' THEN
      DELETE FROM nanivio_pricing_storage_objects WHERE object_id=payload->>'objectId' AND user_id=uid;
    ELSE
      n:=(payload->>'sizeBytes')::numeric;
      IF n IS NULL OR n<0 OR n>9007199254740991 OR n<>trunc(n) THEN RAISE EXCEPTION 'Invalid object size'; END IF;
      IF storage-coalesce(old_size,0)+n>capacity THEN RETURN '{"success":false,"code":"STORAGE_QUOTA_EXCEEDED"}'::jsonb; END IF;
      INSERT INTO nanivio_pricing_storage_objects(object_id,user_id,size_bytes)
        VALUES(payload->>'objectId',uid,n::bigint)
        ON CONFLICT(object_id) DO UPDATE SET size_bytes=excluded.size_bytes
          WHERE nanivio_pricing_storage_objects.user_id=excluded.user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stored object belongs to another account'; END IF;
    END IF;
    RETURN '{"success":true}'::jsonb;
  END IF;
  IF action<>'RESERVE' OR eid IS NULL OR length(eid)>160 OR request IS NULL
    OR jsonb_typeof(request)<>'object' OR request='{}'::jsonb THEN RAISE EXCEPTION 'Invalid usage reservation'; END IF;
  SELECT * INTO e FROM nanivio_pricing_usage_events WHERE event_id=eid FOR UPDATE;
  IF FOUND THEN
    IF e.user_id<>uid OR e.requested<>request THEN RAISE EXCEPTION 'Usage event conflicts with original request'; END IF;
    RETURN jsonb_build_object('success',e.status<>'RELEASED','alreadyReserved',true,'status',e.status);
  END IF;
  FOR resource,n IN SELECT key,value::text::numeric FROM jsonb_each(request) LOOP
    IF resource NOT IN ('callSeconds','translationUnits','textRequests','textCharacters','voiceSeconds','avatarSeconds','searchQueries')
      OR n<=0 OR n>9007199254740991 OR n<>trunc(n) THEN RAISE EXCEPTION 'Invalid usage resource or amount'; END IF;
    IF n>coalesce((total->>resource)::bigint,0) THEN
      RETURN jsonb_build_object('success',false,'code','ALLOWANCE_EXHAUSTED','resource',resource);
    END IF;
  END LOOP;
  -- Every requested resource was checked BEFORE changing any counter.
  FOR resource,n IN SELECT key,value::text::numeric FROM jsonb_each(request) LOOP
    left_to_take:=n::bigint;
    FOR row IN SELECT p.grant_id,p.snapshot,a.allocation,a.ends_at FROM nanivio_pricing_grants p
      CROSS JOIN LATERAL nanivio_pricing_allocation(p.snapshot,p.started_at,now()) a
      WHERE p.user_id=uid AND (p.snapshot->'limits'->>resource)::bigint>0 ORDER BY a.ends_at,p.grant_id
    LOOP
      SELECT c.used INTO available FROM nanivio_pricing_consumption c
        WHERE c.grant_id=row.grant_id AND c.allocation=row.allocation AND c.resource=resource;
      take:=least(left_to_take,(row.snapshot->'limits'->>resource)::bigint-coalesce(available,0));
      IF take>0 THEN
        reserved_end:=least(coalesce(reserved_end,row.ends_at),row.ends_at);
        INSERT INTO nanivio_pricing_consumption(grant_id,allocation,resource,used) VALUES(row.grant_id,row.allocation,resource,take)
          ON CONFLICT ON CONSTRAINT nanivio_pricing_consumption_pkey DO UPDATE SET used=nanivio_pricing_consumption.used+excluded.used;
        debits:=debits||jsonb_build_array(jsonb_build_object('grantId',row.grant_id,'allocation',row.allocation,'resource',resource,'amount',take));
        left_to_take:=left_to_take-take;
      END IF;
      EXIT WHEN left_to_take=0;
    END LOOP;
    IF left_to_take<>0 THEN RAISE EXCEPTION 'Allowance changed during reservation'; END IF;
  END LOOP;
  INSERT INTO nanivio_pricing_usage_events(event_id,user_id,requested,debits,status,expires_at)
    VALUES(eid,uid,request,debits,'RESERVED',least(now()+interval '20 minutes',reserved_end));
  RETURN jsonb_build_object('success',true,'eventId',eid,'usage',request,'expiresAt',least(now()+interval '20 minutes',reserved_end));
END $$;

ALTER TABLE public.nanivio_pricing_grants ENABLE ROW LEVEL SECURITY;
-- Rollout 025 requires partial settlements and quota totals, not an older
-- installation of the staged primitive with the same RPC name.
CREATE OR REPLACE FUNCTION public.nanivio_balanced_ledger_revision()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;
REVOKE ALL ON FUNCTION public.nanivio_balanced_ledger_revision() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.nanivio_pricing_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_pricing_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_pricing_storage_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_pricing_grants,public.nanivio_pricing_consumption,
  public.nanivio_pricing_usage_events,public.nanivio_pricing_storage_objects FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nanivio_pricing_grants,public.nanivio_pricing_consumption,
  public.nanivio_pricing_usage_events,public.nanivio_pricing_storage_objects TO service_role;
REVOKE ALL ON FUNCTION public.nanivio_balanced_usage(text,jsonb),
  public.nanivio_pricing_allocation(jsonb,timestamptz,timestamptz),
  public.nanivio_validate_pricing_snapshot(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_balanced_usage(text,jsonb) TO service_role;
COMMIT;
SELECT true AS balanced_pricing_ledger_installed;
