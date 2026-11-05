-- After 024 and 025. Does not change prices, purchased terms, wallet funds or files.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nanivio_paid_search_events (
  event_id text PRIMARY KEY, user_id text NOT NULL, reserved integer NOT NULL,
  provider_queries integer, charged_queries integer, legacy boolean NOT NULL,
  settled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nanivio_plan_stored_objects (
  object_id text PRIMARY KEY, user_id text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes>=0),
  kind text NOT NULL CHECK(kind IN ('chat','business')), channel_id text,
  file_name text, url text, state text NOT NULL CHECK(state IN ('PENDING','STORED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nanivio_plan_stored_owner ON public.nanivio_plan_stored_objects(user_id);

CREATE OR REPLACE FUNCTION public.nanivio_paid_search(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid text:=payload->>'userId'; eid text:=payload->>'eventId';
  item nanivio_paid_search_events%ROWTYPE; access jsonb; result jsonb;
  budget integer; measured integer; charged integer; legacy boolean;
BEGIN
  IF uid IS NULL OR length(uid) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Authenticated owner required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('balanced-usage:'||uid));
  PERFORM nanivio_refresh_balanced_terms(uid);
  IF action='ACCESS' THEN
    SELECT EXISTS(SELECT 1 FROM nanivio_balanced_terms WHERE user_id=uid AND family='malvi'
      AND started_at<=now() AND expires_at>now()) INTO legacy;
    access:=nanivio_balanced_usage('ACCESS',jsonb_build_object('userId',uid));
    RETURN access || jsonb_build_object('legacy',NOT legacy,'maximumQueriesPerRequest',4);
  END IF;
  IF eid IS NULL OR length(eid) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Usage identity required'; END IF;
  SELECT * INTO item FROM nanivio_paid_search_events WHERE event_id=eid FOR UPDATE;
  IF FOUND THEN
    IF item.user_id<>uid THEN RAISE EXCEPTION 'Usage belongs to another owner'; END IF;
    IF action='RESERVE' OR item.settled THEN
      RETURN jsonb_build_object('success',true,'reserved',item.reserved,'chargedQueries',item.charged_queries,'legacy',item.legacy);
    END IF;
  ELSIF action<>'RESERVE' THEN RAISE EXCEPTION 'Unknown paid-search event';
  END IF;
  IF action='RESERVE' THEN
    -- Pre-cutover paid terms keep their established request safety caps.
    SELECT NOT EXISTS(SELECT 1 FROM nanivio_balanced_terms WHERE user_id=uid AND family='malvi'
      AND started_at<=now() AND expires_at>now()) INTO legacy;
    budget:=0;
    IF NOT legacy THEN
      access:=nanivio_balanced_usage('ACCESS',jsonb_build_object('userId',uid));
      budget:=least(4,coalesce((access->'remaining'->>'searchQueries')::integer,0));
      IF budget<1 THEN RETURN '{"success":false,"code":"SEARCH_ALLOWANCE_EXHAUSTED"}'; END IF;
      result:=nanivio_balanced_usage('RESERVE',jsonb_build_object('userId',uid,'eventId',eid,'usage',jsonb_build_object('searchQueries',budget)));
      IF result->>'success'<>'true' THEN RETURN result; END IF;
    END IF;
    INSERT INTO nanivio_paid_search_events(event_id,user_id,reserved,legacy) VALUES(eid,uid,budget,legacy);
    RETURN jsonb_build_object('success',true,'reserved',budget,'legacy',legacy);
  ELSIF action='SETTLE' THEN
    IF payload ? 'providerQueries' THEN
      measured:=(payload->>'providerQueries')::integer;
      IF measured<0 OR measured>100000 THEN RAISE EXCEPTION 'Invalid provider query count'; END IF;
    END IF;
    charged:=CASE WHEN item.legacy THEN 0 ELSE least(item.reserved,coalesce(measured,item.reserved)) END;
    IF NOT item.legacy THEN
      result:=nanivio_balanced_usage('COMMIT',jsonb_build_object('userId',uid,'eventId',eid,'usage',jsonb_build_object('searchQueries',charged)));
      IF result->>'success'<>'true' THEN RETURN result; END IF;
    END IF;
    -- Preserve actual fan-out, including any excess absorbed by Nanivio.
    UPDATE nanivio_paid_search_events SET provider_queries=measured,charged_queries=charged,settled=true WHERE event_id=eid;
    RETURN jsonb_build_object('success',true,'chargedQueries',charged,'providerQueries',measured,'legacy',item.legacy);
  END IF;
  RAISE EXCEPTION 'Invalid paid-search action';
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_plan_storage(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid text:=payload->>'userId'; oid text:=payload->>'objectId';
  item nanivio_plan_stored_objects%ROWTYPE; n bigint; used bigint; capacity bigint:=2000000000;
  terms jsonb; tier text; files jsonb; legacy_paid boolean:=false;
BEGIN
  IF uid IS NULL OR length(uid) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Authenticated owner required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('plan-storage:'||uid));
  SELECT snapshot INTO terms FROM nanivio_balanced_terms WHERE user_id=uid AND family='communication'
    AND started_at<=now() AND expires_at>now() ORDER BY started_at DESC LIMIT 1;
  IF FOUND THEN capacity:=coalesce((terms->'limits'->>'storageBytes')::bigint,0);
  ELSE
    -- Preserve the original legacy storage benefits until the paid term ends.
    SELECT s.tier INTO tier FROM nanivio_subscriptions s WHERE s.user_id=uid
      AND s.status='ACTIVE' AND s.current_period_start<=now() AND s.current_period_end>now()
      ORDER BY s.current_period_start DESC LIMIT 1;
    -- Historical rows do not retain administrator-customized storage snapshots.
    -- Do not invent a retroactive cap or reduce an existing paid benefit.
    legacy_paid:=coalesce(tier IN ('individual_premium','pro_premium','business_b2b'),false);
  END IF;
  SELECT coalesce(sum(size_bytes),0) INTO used FROM nanivio_plan_stored_objects WHERE user_id=uid;
  IF action='ACCESS' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',object_id,'name',file_name,'bytes',size_bytes,'state',state,'channelId',channel_id)
      ORDER BY created_at DESC),'[]') INTO files FROM (SELECT * FROM nanivio_plan_stored_objects
      WHERE user_id=uid AND kind='chat' ORDER BY created_at DESC LIMIT 100) f;
    RETURN jsonb_build_object('success',true,'capacityBytes',CASE WHEN legacy_paid THEN NULL ELSE capacity END,
      'usedBytes',used,'remainingBytes',CASE WHEN legacy_paid THEN NULL ELSE greatest(0,capacity-used) END,
      'objects',files,'legacyPaidTerm',legacy_paid,'legacyChatInventoryComplete',false);
  END IF;
  IF oid IS NULL OR length(oid) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Stored object identity required'; END IF;
  SELECT * INTO item FROM nanivio_plan_stored_objects WHERE object_id=oid FOR UPDATE;
  IF FOUND AND item.user_id<>uid THEN RAISE EXCEPTION 'Stored object belongs to another owner'; END IF;
  IF action='RESERVE' OR action='BUSINESS_SET' THEN
    n:=(payload->>'sizeBytes')::bigint;
    IF n IS NULL OR n<0 OR n>9007199254740991 THEN RAISE EXCEPTION 'Invalid stored size'; END IF;
    IF action='RESERVE' AND item.object_id IS NOT NULL THEN RAISE EXCEPTION 'Upload identity already used'; END IF;
    IF NOT legacy_paid AND n>coalesce(item.size_bytes,0) AND used-coalesce(item.size_bytes,0)+n>capacity
      AND NOT (action='BUSINESS_SET' AND coalesce((payload->>'cleanup')::boolean,false) AND n<=coalesce(item.size_bytes,0)+64) THEN
      RETURN '{"success":false,"code":"STORAGE_QUOTA_EXCEEDED"}';
    END IF;
    INSERT INTO nanivio_plan_stored_objects(object_id,user_id,size_bytes,kind,channel_id,file_name,state)
      VALUES(oid,uid,n,CASE WHEN action='BUSINESS_SET' THEN 'business' ELSE 'chat' END,
        payload->>'channelId',left(payload->>'fileName',200),CASE WHEN action='BUSINESS_SET' THEN 'STORED' ELSE 'PENDING' END)
      ON CONFLICT(object_id) DO UPDATE SET size_bytes=excluded.size_bytes;
  ELSIF action='COMPLETE' THEN
    IF item.object_id IS NULL OR item.state<>'PENDING' OR payload->>'url' NOT LIKE 'https://%' THEN RAISE EXCEPTION 'Unknown pending upload'; END IF;
    UPDATE nanivio_plan_stored_objects SET url=payload->>'url',state='STORED' WHERE object_id=oid;
  ELSIF action='DELETE' THEN
    DELETE FROM nanivio_plan_stored_objects WHERE object_id=oid AND user_id=uid;
  ELSIF action='READ' THEN
    IF item.object_id IS NULL THEN RETURN '{"success":false,"code":"STORAGE_FILE_NOT_FOUND"}'; END IF;
    RETURN jsonb_build_object('success',true,'object',to_jsonb(item));
  ELSE RAISE EXCEPTION 'Invalid storage action';
  END IF;
  RETURN '{"success":true}';
END $$;

-- Workspace JSON is real persisted storage, not a monthly-resetting counter.
CREATE OR REPLACE FUNCTION public.nanivio_meter_business_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM nanivio_plan_storage('DELETE',jsonb_build_object('userId',OLD.owner_id,'objectId','business:'||OLD.id));
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND NEW.owner_id<>OLD.owner_id THEN RAISE EXCEPTION 'Workspace ownership cannot change through a content update'; END IF;
  result:=nanivio_plan_storage('BUSINESS_SET',jsonb_build_object('userId',NEW.owner_id,'objectId','business:'||NEW.id,
    'sizeBytes',octet_length(NEW.document::text),
    'cleanup',TG_OP='UPDATE' AND NEW.document->>'meetingOpen'='false' AND OLD.document->>'meetingOpen'='true'));
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'STORAGE_QUOTA_EXCEEDED'; END IF;
  RETURN NEW;
END $$;
-- Inventory existing workspace documents without deleting or rejecting over-cap data.
INSERT INTO nanivio_plan_stored_objects(object_id,user_id,size_bytes,kind,state)
  SELECT 'business:'||id,owner_id,octet_length(document::text),'business','STORED' FROM nanivio_malvi_business_rooms
  ON CONFLICT(object_id) DO UPDATE SET size_bytes=excluded.size_bytes;
DROP TRIGGER IF EXISTS nanivio_business_storage_meter ON nanivio_malvi_business_rooms;
CREATE TRIGGER nanivio_business_storage_meter BEFORE INSERT OR UPDATE OR DELETE ON nanivio_malvi_business_rooms
  FOR EACH ROW EXECUTE FUNCTION nanivio_meter_business_storage();
ALTER TABLE nanivio_paid_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanivio_plan_stored_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nanivio_paid_search_events,nanivio_plan_stored_objects FROM PUBLIC,anon,authenticated;
GRANT ALL ON nanivio_paid_search_events,nanivio_plan_stored_objects TO service_role;
REVOKE ALL ON FUNCTION nanivio_paid_search(text,jsonb),nanivio_plan_storage(text,jsonb),nanivio_meter_business_storage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nanivio_paid_search(text,jsonb),nanivio_plan_storage(text,jsonb) TO service_role;
COMMIT;
SELECT true AS plan_enforcement_installed;
