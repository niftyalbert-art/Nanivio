-- Apply after 012. No catalogue prices, purchased allowances or dates are reset.
-- Reservations use the existing Malvi credit account AND the purchased
-- voice/video bucket. Failed setup refunds its reservation; normal shutdown
-- refunds unused time. Only confirmed server time is charged after a crash.
-- The legacy credit command must not change a balance twice for the same
-- entitlement reference when two instances initialize the same account.
CREATE OR REPLACE FUNCTION public.nanivio_malvi_credit_command(command_name TEXT,payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid TEXT := payload->>'userId'; amt NUMERIC := (payload->>'amount')::NUMERIC;
  ref TEXT := payload->>'reference'; acct public.malvi_credit_accounts%ROWTYPE;
  prior public.malvi_credit_ledger%ROWTYPE; newbal NUMERIC; direction_name TEXT;
  source_name TEXT := COALESCE(payload->>'source','MALVI');
  type_name TEXT := COALESCE(payload->>'creditType','MALVI_USAGE');
BEGIN
  IF uid IS NULL OR amt IS NULL OR amt<=0 OR amt::TEXT IN ('NaN','Infinity','-Infinity') OR ref IS NULL
    OR command_name NOT IN ('CREDIT','DEBIT') THEN RAISE EXCEPTION 'Invalid Malvi credit command'; END IF;
  direction_name := CASE WHEN command_name='CREDIT' THEN 'CREDIT' ELSE 'DEBIT' END;
  INSERT INTO malvi_credit_accounts(user_id,credit_balance) VALUES(uid,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO acct FROM malvi_credit_accounts WHERE user_id=uid FOR UPDATE;
  SELECT * INTO prior FROM malvi_credit_ledger WHERE user_id=uid AND reference=ref;
  IF FOUND THEN
    IF prior.amount<>amt OR prior.direction<>direction_name OR prior.source<>source_name OR prior.credit_type<>type_name
      THEN RAISE EXCEPTION 'MALVI_CREDIT_REFERENCE_CONFLICT'; END IF;
    RETURN jsonb_build_object('success',true,'creditBalance',acct.credit_balance,'reference',ref);
  END IF;
  newbal := acct.credit_balance + CASE WHEN command_name='CREDIT' THEN amt ELSE -amt END;
  IF newbal<0 THEN RAISE EXCEPTION 'Insufficient Malvi AI Ecosystem credit'; END IF;
  UPDATE malvi_credit_accounts SET credit_balance=newbal,version=version+1,updated_at=clock_timestamp() WHERE id=acct.id;
  INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,status,metadata)
    VALUES(acct.id,uid,direction_name,amt,type_name,ref,source_name,'POSTED',COALESCE(payload->'metadata','{}'::jsonb));
  RETURN jsonb_build_object('success',true,'creditBalance',newbal,'reference',ref);
END $$;
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_runtime_policy (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
  version INTEGER NOT NULL DEFAULT 0,
  live_minutes_monthly INTEGER CHECK(live_minutes_monthly BETWEEN 0 AND 1000000000),
  research_monthly INTEGER CHECK(research_monthly BETWEEN 0 AND 1000000000),
  analyses_monthly INTEGER CHECK(analyses_monthly BETWEEN 0 AND 1000000000),
  upload_mib_monthly INTEGER CHECK(upload_mib_monthly BETWEEN 0 AND 1000000000),
  updated_by TEXT, updated_at TIMESTAMPTZ, reason TEXT
);
INSERT INTO public.nanivio_malvi_runtime_policy(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_runtime_audit (
  version INTEGER PRIMARY KEY, saved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor TEXT NOT NULL, reason TEXT NOT NULL, limits JSONB NOT NULL
);
ALTER TABLE public.nanivio_malvi_runtime_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_runtime_audit FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_fleet_usage (
  month DATE PRIMARY KEY, live_minutes NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(live_minutes>=0)
);
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_request_usage (
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE RESTRICT,
  month DATE NOT NULL, research INTEGER NOT NULL DEFAULT 0, analyses INTEGER NOT NULL DEFAULT 0,
  upload_bytes BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(user_id,month)
);
ALTER TABLE public.nanivio_malvi_runtime_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_malvi_fleet_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_malvi_request_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_runtime_policy,public.nanivio_malvi_fleet_usage,public.nanivio_malvi_request_usage FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_live_leases (
  lease_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE RESTRICT,
  subscription_id TEXT NOT NULL REFERENCES public.nanivio_malvi_subscriptions(subscription_id),
  mode TEXT NOT NULL CHECK (mode IN ('voice','avatar')),
  reserved_seconds INTEGER NOT NULL CHECK (reserved_seconds BETWEEN 1 AND 600),
  reserved_credits NUMERIC(18,6) NOT NULL CHECK (reserved_credits > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ends_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  settled_at TIMESTAMPTZ,
  charged_seconds INTEGER,
  CHECK (charged_seconds IS NULL OR charged_seconds BETWEEN 0 AND reserved_seconds)
);
CREATE UNIQUE INDEX IF NOT EXISTS malvi_one_open_live_lease
  ON public.nanivio_malvi_live_leases(user_id) WHERE settled_at IS NULL;
ALTER TABLE public.nanivio_malvi_live_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_live_leases FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.nanivio_finish_malvi_live(p_lease TEXT, p_cancel BOOLEAN DEFAULT false, p_reconcile BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.nanivio_malvi_live_leases%ROWTYPE; uid TEXT;
  seconds_used INTEGER; refund NUMERIC; refund_minutes NUMERIC; account_id UUID;
BEGIN
  SELECT user_id INTO uid FROM nanivio_malvi_live_leases WHERE lease_id=p_lease;
  IF uid IS NULL THEN RETURN jsonb_build_object('success',true,'absent',true); END IF;
  -- A common owner lock orders reserve/finish/confirm on multiple instances.
  PERFORM 1 FROM nanivio_users WHERE id=uid FOR UPDATE;
  SELECT * INTO l FROM nanivio_malvi_live_leases WHERE lease_id=p_lease FOR UPDATE;
  IF l.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'chargedSeconds',l.charged_seconds);
  END IF;
  IF p_reconcile AND l.ends_at > clock_timestamp() THEN
    RAISE EXCEPTION 'MALVI_SESSION_ACTIVE';
  END IF;
  seconds_used := CASE WHEN p_cancel THEN 0 ELSE
    LEAST(l.reserved_seconds,GREATEST(0,CEIL(EXTRACT(EPOCH FROM
      (LEAST(l.ends_at,CASE WHEN p_reconcile THEN l.confirmed_at ELSE clock_timestamp() END)-l.started_at)))::INTEGER)) END;
  refund := l.reserved_credits - ROUND(seconds_used::NUMERIC/60,6);
  refund_minutes := ROUND((l.reserved_seconds-seconds_used)::NUMERIC/60,6);
  UPDATE nanivio_malvi_subscriptions SET
    voice_minutes_used=GREATEST(0,voice_minutes_used-CASE WHEN l.mode='voice' THEN refund_minutes ELSE 0 END),
    video_minutes_used=GREATEST(0,video_minutes_used-CASE WHEN l.mode='avatar' THEN refund_minutes ELSE 0 END)
    WHERE subscription_id=l.subscription_id;
  UPDATE nanivio_malvi_fleet_usage SET live_minutes=GREATEST(0,live_minutes-refund_minutes)
    WHERE month=date_trunc('month',l.started_at AT TIME ZONE 'UTC')::DATE;
  IF refund > 0 THEN
    UPDATE malvi_credit_accounts SET credit_balance=credit_balance+refund, version=version+1,updated_at=clock_timestamp()
      WHERE user_id=uid RETURNING id INTO account_id;
    INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
      VALUES(account_id,uid,'REVERSAL',refund,'MALVI_MINUTES','malvi_live_refund_'||p_lease,'MALVI_LIVE',
        jsonb_build_object('sessionId',p_lease,'unusedSeconds',l.reserved_seconds-seconds_used));
  END IF;
  UPDATE nanivio_malvi_live_leases SET settled_at=clock_timestamp(),charged_seconds=seconds_used WHERE lease_id=p_lease;
  RETURN jsonb_build_object('success',true,'chargedSeconds',seconds_used,'refundedCredits',refund);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_reserve_malvi_live(p_user TEXT,p_lease TEXT,p_mode TEXT,p_max_seconds INTEGER DEFAULT 600)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.nanivio_malvi_subscriptions%ROWTYPE; a public.malvi_credit_accounts%ROWTYPE;
  l public.nanivio_malvi_live_leases%ROWTYPE; allowed INTEGER; credits NUMERIC; t TIMESTAMPTZ := clock_timestamp();
  policy_limit INTEGER; fleet NUMERIC; month_key DATE;
BEGIN
  IF p_mode NOT IN ('voice','avatar') OR p_user IS NULL OR p_lease IS NULL OR length(p_lease)>100
    OR p_max_seconds IS NULL OR p_max_seconds NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'MALVI_INVALID_RESERVATION'; END IF;
  PERFORM 1 FROM nanivio_users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MALVI_ACCOUNT_REQUIRED'; END IF;
  SELECT * INTO l FROM nanivio_malvi_live_leases WHERE lease_id=p_lease;
  IF FOUND THEN
    IF l.user_id<>p_user OR l.mode<>p_mode THEN RAISE EXCEPTION 'MALVI_RESERVATION_OWNER'; END IF;
    IF l.settled_at IS NOT NULL OR l.ends_at<=t THEN RAISE EXCEPTION 'MALVI_RESERVATION_EXPIRED'; END IF;
    RETURN jsonb_build_object('success',true,'seconds',FLOOR(EXTRACT(EPOCH FROM (l.ends_at-t))),'expiresAt',l.ends_at);
  END IF;
  SELECT * INTO l FROM nanivio_malvi_live_leases WHERE user_id=p_user AND settled_at IS NULL;
  IF FOUND THEN
    IF l.ends_at>t THEN RAISE EXCEPTION 'MALVI_SESSION_ACTIVE'; END IF;
    PERFORM nanivio_finish_malvi_live(l.lease_id,false,true);
  END IF;
  SELECT * INTO s FROM nanivio_malvi_subscriptions WHERE user_id=p_user
    ORDER BY updated_at DESC,subscription_id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('ACTIVE','TRIAL') OR s.current_period_start>t OR s.current_period_end<=t
    THEN RAISE EXCEPTION 'MALVI_PLAN_REQUIRED'; END IF;
  IF p_mode='avatar' AND s.tier='malvi_voice' THEN RAISE EXCEPTION 'MALVI_AVATAR_NOT_INCLUDED'; END IF;
  SELECT * INTO a FROM malvi_credit_accounts WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MALVI_ALLOWANCE_EXHAUSTED'; END IF;
  SELECT live_minutes_monthly INTO policy_limit FROM nanivio_malvi_runtime_policy WHERE id=true FOR SHARE;
  IF policy_limit IS NULL THEN RAISE EXCEPTION 'MALVI_RUNTIME_LIMITS_REQUIRED'; END IF;
  month_key := date_trunc('month',t AT TIME ZONE 'UTC')::DATE;
  INSERT INTO nanivio_malvi_fleet_usage(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  SELECT live_minutes INTO fleet FROM nanivio_malvi_fleet_usage WHERE month=month_key FOR UPDATE;
  IF policy_limit-fleet<1.0/60 THEN RAISE EXCEPTION 'MALVI_SHARED_LIMIT'; END IF;
  allowed := LEAST(p_max_seconds,FLOOR(a.credit_balance*60)::INTEGER,
    FLOOR(LEAST(600::NUMERIC,(policy_limit-fleet)*60))::INTEGER,
    FLOOR(EXTRACT(EPOCH FROM (s.current_period_end-t)))::INTEGER,
    FLOOR(60*CASE WHEN p_mode='voice' THEN s.voice_minutes_allowed-s.voice_minutes_used
      ELSE s.video_minutes_allowed-s.video_minutes_used END)::INTEGER);
  IF allowed<1 THEN RAISE EXCEPTION 'MALVI_ALLOWANCE_EXHAUSTED'; END IF;
  credits := ROUND(allowed::NUMERIC/60,6);
  UPDATE malvi_credit_accounts SET credit_balance=credit_balance-credits,version=version+1,updated_at=t WHERE id=a.id;
  UPDATE nanivio_malvi_fleet_usage SET live_minutes=live_minutes+credits WHERE month=month_key;
  UPDATE nanivio_malvi_subscriptions SET
    voice_minutes_used=voice_minutes_used+CASE WHEN p_mode='voice' THEN credits ELSE 0 END,
    video_minutes_used=video_minutes_used+CASE WHEN p_mode='avatar' THEN credits ELSE 0 END
    WHERE subscription_id=s.subscription_id;
  INSERT INTO nanivio_malvi_live_leases(lease_id,user_id,subscription_id,mode,reserved_seconds,reserved_credits,started_at,ends_at,confirmed_at)
    VALUES(p_lease,p_user,s.subscription_id,p_mode,allowed,credits,t,t+allowed*INTERVAL '1 second',t);
  INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
    VALUES(a.id,p_user,'DEBIT',credits,'MALVI_MINUTES','malvi_live_reserve_'||p_lease,'MALVI_LIVE',
      jsonb_build_object('sessionId',p_lease,'subscriptionId',s.subscription_id,'reservedSeconds',allowed,'mode',p_mode));
  RETURN jsonb_build_object('success',true,'seconds',allowed,'expiresAt',t+allowed*INTERVAL '1 second');
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_confirm_malvi_live(p_lease TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid TEXT;
BEGIN
  SELECT user_id INTO uid FROM nanivio_malvi_live_leases WHERE lease_id=p_lease;
  IF uid IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM nanivio_users WHERE id=uid FOR UPDATE;
  UPDATE nanivio_malvi_live_leases SET confirmed_at=clock_timestamp()
    WHERE lease_id=p_lease AND settled_at IS NULL AND ends_at>clock_timestamp();
  RETURN FOUND;
END $$;

-- Limits are explicit administrator-owned safety caps, not new plan prices or
-- invented included benefits. NULL means unconfigured; zero disables the work.
CREATE OR REPLACE FUNCTION public.nanivio_claim_malvi_request(p_user TEXT,p_kind TEXT,p_bytes BIGINT DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE policy public.nanivio_malvi_runtime_policy%ROWTYPE; used public.nanivio_malvi_request_usage%ROWTYPE;
  month_key DATE := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::DATE;
BEGIN
  IF p_kind NOT IN ('research','analysis') OR p_bytes IS NULL OR p_bytes<0 OR p_bytes>8388608
    OR (p_kind='research' AND p_bytes<>0) THEN RAISE EXCEPTION 'MALVI_INVALID_REQUEST'; END IF;
  PERFORM 1 FROM nanivio_users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MALVI_ACCOUNT_REQUIRED'; END IF;
  SELECT * INTO policy FROM nanivio_malvi_runtime_policy WHERE id=true FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM nanivio_malvi_subscriptions WHERE user_id=p_user AND status IN ('ACTIVE','TRIAL')
    AND current_period_start<=clock_timestamp() AND current_period_end>clock_timestamp())
    THEN RAISE EXCEPTION 'MALVI_PLAN_REQUIRED'; END IF;
  IF (p_kind='research' AND policy.research_monthly IS NULL)
    OR (p_kind='analysis' AND (policy.analyses_monthly IS NULL OR policy.upload_mib_monthly IS NULL))
    THEN RAISE EXCEPTION 'MALVI_RUNTIME_LIMITS_REQUIRED'; END IF;
  INSERT INTO nanivio_malvi_request_usage(user_id,month) VALUES(p_user,month_key) ON CONFLICT DO NOTHING;
  SELECT * INTO used FROM nanivio_malvi_request_usage WHERE user_id=p_user AND month=month_key FOR UPDATE;
  IF (p_kind='research' AND used.research>=policy.research_monthly)
    OR (p_kind='analysis' AND (used.analyses>=policy.analyses_monthly OR used.upload_bytes+p_bytes>policy.upload_mib_monthly::BIGINT*1048576))
    THEN RAISE EXCEPTION 'MALVI_REQUEST_LIMIT'; END IF;
  UPDATE nanivio_malvi_request_usage SET research=research+CASE WHEN p_kind='research' THEN 1 ELSE 0 END,
    analyses=analyses+CASE WHEN p_kind='analysis' THEN 1 ELSE 0 END,upload_bytes=upload_bytes+p_bytes
    WHERE user_id=p_user AND month=month_key;
  RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_save_malvi_runtime_limits(p_limits JSONB,p_version INTEGER,p_actor TEXT,p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_policy public.nanivio_malvi_runtime_policy%ROWTYPE; key TEXT;
BEGIN
  IF p_actor IS NULL OR length(trim(p_actor))=0 OR length(trim(p_reason)) NOT BETWEEN 8 AND 500
    OR p_version IS NULL OR p_version<0 OR jsonb_typeof(p_limits)<>'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_limits))<>4 THEN RAISE EXCEPTION 'MALVI_INVALID_POLICY'; END IF;
  FOREACH key IN ARRAY ARRAY['live_minutes_monthly','research_monthly','analyses_monthly','upload_mib_monthly'] LOOP
    IF jsonb_typeof(p_limits->key) IS DISTINCT FROM 'number' OR (p_limits->>key)::NUMERIC<0 OR
      (p_limits->>key)::NUMERIC>1000000000 OR trunc((p_limits->>key)::NUMERIC)<>(p_limits->>key)::NUMERIC
      THEN RAISE EXCEPTION 'MALVI_INVALID_POLICY'; END IF;
  END LOOP;
  SELECT * INTO current_policy FROM nanivio_malvi_runtime_policy WHERE id=true FOR UPDATE;
  IF current_policy.version<>p_version THEN RAISE EXCEPTION 'MALVI_POLICY_CONFLICT'; END IF;
  UPDATE nanivio_malvi_runtime_policy SET version=version+1,updated_by=p_actor,updated_at=clock_timestamp(),reason=trim(p_reason),
    live_minutes_monthly=(p_limits->>'live_minutes_monthly')::INTEGER,research_monthly=(p_limits->>'research_monthly')::INTEGER,
    analyses_monthly=(p_limits->>'analyses_monthly')::INTEGER,upload_mib_monthly=(p_limits->>'upload_mib_monthly')::INTEGER
    WHERE id=true RETURNING * INTO current_policy;
  INSERT INTO nanivio_malvi_runtime_audit(version,actor,reason,limits) VALUES(current_policy.version,p_actor,trim(p_reason),p_limits);
  RETURN to_jsonb(current_policy);
END $$;

REVOKE ALL ON FUNCTION public.nanivio_reserve_malvi_live(TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nanivio_malvi_credit_command(TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nanivio_finish_malvi_live(TEXT,BOOLEAN,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nanivio_confirm_malvi_live(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nanivio_claim_malvi_request(TEXT,TEXT,BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nanivio_save_malvi_runtime_limits(JSONB,INTEGER,TEXT,TEXT) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.nanivio_malvi_credit_command(TEXT,JSONB) FROM anon;
    REVOKE ALL ON public.nanivio_malvi_live_leases FROM anon;
    REVOKE ALL ON public.nanivio_malvi_runtime_policy,public.nanivio_malvi_fleet_usage,public.nanivio_malvi_request_usage FROM anon;
    REVOKE ALL ON public.nanivio_malvi_runtime_audit FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.nanivio_malvi_credit_command(TEXT,JSONB) FROM authenticated;
    REVOKE ALL ON public.nanivio_malvi_live_leases FROM authenticated;
    REVOKE ALL ON public.nanivio_malvi_runtime_policy,public.nanivio_malvi_fleet_usage,public.nanivio_malvi_request_usage FROM authenticated;
    REVOKE ALL ON public.nanivio_malvi_runtime_audit FROM authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.nanivio_malvi_credit_command(TEXT,JSONB) TO service_role;
    GRANT SELECT ON public.nanivio_malvi_live_leases TO service_role;
    GRANT SELECT ON public.nanivio_malvi_runtime_policy,public.nanivio_malvi_runtime_audit TO service_role;
    GRANT SELECT ON public.nanivio_malvi_fleet_usage TO service_role;
    GRANT EXECUTE ON FUNCTION public.nanivio_reserve_malvi_live(TEXT,TEXT,TEXT,INTEGER) TO service_role;
    GRANT EXECUTE ON FUNCTION public.nanivio_finish_malvi_live(TEXT,BOOLEAN,BOOLEAN) TO service_role;
    GRANT EXECUTE ON FUNCTION public.nanivio_confirm_malvi_live(TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.nanivio_claim_malvi_request(TEXT,TEXT,BIGINT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.nanivio_save_malvi_runtime_limits(JSONB,INTEGER,TEXT,TEXT) TO service_role;
  END IF;
END $$;
