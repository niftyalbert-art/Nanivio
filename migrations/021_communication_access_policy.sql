-- Additive policy and usage reservations. No wallets, payments or purchased
-- quotas are replaced. Only the server service role may execute this API.
CREATE TABLE IF NOT EXISTS public.nanivio_communication_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  config jsonb NOT NULL DEFAULT '{"callTrialDays":30,"liveTrialMinutes":3,"paidTextCharacters":20000,"warningSeconds":60,"plans":[]}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.nanivio_communication_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.nanivio_communication_accounts (
  user_id text PRIMARY KEY,
  first_connected_at timestamptz,
  trial_ends_at timestamptz,
  live_trial_remaining numeric,
  CHECK(live_trial_remaining IS NULL OR live_trial_remaining>=0)
);
CREATE TABLE IF NOT EXISTS public.nanivio_communication_text_terms (
  subscription_id text PRIMARY KEY,
  user_id text NOT NULL,
  allowance numeric NOT NULL CHECK(allowance>=0),
  used numeric NOT NULL DEFAULT 0 CHECK(used>=0)
);
CREATE TABLE IF NOT EXISTS public.nanivio_communication_reservations (
  event_id text PRIMARY KEY,
  user_id text NOT NULL,
  resource text NOT NULL CHECK(resource IN ('call','live','note','text')),
  requested numeric NOT NULL,
  amount numeric NOT NULL,
  source text NOT NULL,
  subscription_id text,
  status text NOT NULL DEFAULT 'RESERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '90 seconds'
);
CREATE INDEX IF NOT EXISTS nanivio_communication_reservation_owner
  ON public.nanivio_communication_reservations(user_id,status,expires_at);
CREATE TABLE IF NOT EXISTS public.nanivio_communication_adjustments(
  request_id uuid PRIMARY KEY, user_id text NOT NULL, actor_id text NOT NULL,
  resource text NOT NULL, delta numeric NOT NULL, reason text NOT NULL,
  subscription_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.nanivio_capture_text_term()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.tier<>'free' AND NEW.status='ACTIVE' THEN
    INSERT INTO nanivio_communication_text_terms(subscription_id,user_id,allowance)
      SELECT NEW.subscription_id,NEW.user_id,(config->>'paidTextCharacters')::numeric
      FROM nanivio_communication_policy WHERE singleton ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nanivio_capture_text_term ON public.nanivio_subscriptions;
CREATE TRIGGER nanivio_capture_text_term AFTER INSERT ON public.nanivio_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.nanivio_capture_text_term();
-- Backfill only this new text allowance; do not refill any calling/audio quota.
INSERT INTO public.nanivio_communication_text_terms(subscription_id,user_id,allowance)
SELECT s.subscription_id,s.user_id,(p.config->>'paidTextCharacters')::numeric
FROM public.nanivio_subscriptions s CROSS JOIN public.nanivio_communication_policy p
WHERE s.tier<>'free' AND s.status='ACTIVE' AND s.current_period_end>now()
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.nanivio_communication_access(action text,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid text:=nullif(payload->>'userId','');
  cfg jsonb;
  account nanivio_communication_accounts%ROWTYPE;
  sub nanivio_subscriptions%ROWTYPE;
  term nanivio_communication_text_terms%ROWTYPE;
  receipt nanivio_communication_reservations%ROWTYPE;
  expired record;
  adjustment record;
  eid text:=nullif(payload->>'eventId','');
  kind text:=payload->>'resource';
  quantity numeric;
  granted numeric;
  remaining numeric;
  origin text;
  paid boolean:=false;
  trial_left numeric;
  keep numeric;
BEGIN
  SELECT config INTO cfg FROM nanivio_communication_policy WHERE singleton;
  IF action='POLICY' THEN RETURN jsonb_build_object('success',true,'config',cfg); END IF;
  IF action='SAVE_POLICY' THEN
    IF jsonb_typeof(payload->'config')<>'object'
      OR (payload->'config'->>'callTrialDays')::numeric NOT BETWEEN 0 AND 365
      OR (payload->'config'->>'liveTrialMinutes')::numeric NOT BETWEEN 0 AND 10000
      OR (payload->'config'->>'paidTextCharacters')::numeric NOT BETWEEN 0 AND 10000000
      OR (payload->'config'->>'warningSeconds')::numeric NOT BETWEEN 1 AND 600 THEN
      RAISE EXCEPTION 'Invalid communication policy';
    END IF;
    UPDATE nanivio_communication_policy SET config=payload->'config',updated_at=now() WHERE singleton;
    INSERT INTO nanivio_billing_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(uid,'COMMUNICATION_POLICY_UPDATED','communication_policy','default',
        jsonb_build_object('before',cfg,'after',payload->'config'));
    RETURN jsonb_build_object('success',true,'config',payload->'config');
  END IF;
  IF uid IS NULL THEN RAISE EXCEPTION 'An authenticated account is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:'||uid));
  INSERT INTO nanivio_communication_accounts(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  SELECT * INTO account FROM nanivio_communication_accounts WHERE user_id=uid FOR UPDATE;
  -- Refund abandoned provider jobs. Committed speech/calls are never refunded
  -- by a reconnect or by the browser closing.
  FOR expired IN SELECT * FROM nanivio_communication_reservations
    WHERE user_id=uid AND status='RESERVED' AND expires_at<now() FOR UPDATE
  LOOP
    IF expired.source='live_trial' THEN
      UPDATE nanivio_communication_accounts SET live_trial_remaining=live_trial_remaining+expired.amount WHERE user_id=uid;
    ELSIF expired.resource='text' THEN
      UPDATE nanivio_communication_text_terms SET used=greatest(0,used-expired.amount) WHERE subscription_id=expired.subscription_id;
    ELSIF expired.resource='call' AND expired.source='subscription' THEN
      UPDATE nanivio_subscriptions SET voice_minutes_used=greatest(0,voice_minutes_used-expired.amount/60) WHERE subscription_id=expired.subscription_id;
    ELSIF expired.resource IN ('live','note') AND expired.source='subscription' THEN
      UPDATE nanivio_subscriptions SET langpretation_minutes_used=greatest(0,langpretation_minutes_used-expired.amount/60),
        langpretation_minutes_remaining=least(langpretation_minutes_quota,langpretation_minutes_remaining+expired.amount/60)
        WHERE subscription_id=expired.subscription_id;
    END IF;
    UPDATE nanivio_communication_reservations SET status='RELEASED' WHERE event_id=expired.event_id;
  END LOOP;
  SELECT * INTO account FROM nanivio_communication_accounts WHERE user_id=uid;
  SELECT * INTO sub FROM nanivio_subscriptions WHERE user_id=uid AND tier<>'free'
    AND status='ACTIVE' AND current_period_end>now()
    ORDER BY current_period_start DESC,created_at DESC LIMIT 1 FOR UPDATE;
  paid:=FOUND;
  IF paid THEN
    INSERT INTO nanivio_communication_text_terms(subscription_id,user_id,allowance)
      VALUES(sub.subscription_id,uid,(cfg->>'paidTextCharacters')::numeric) ON CONFLICT DO NOTHING;
    SELECT * INTO term FROM nanivio_communication_text_terms WHERE subscription_id=sub.subscription_id;
  END IF;
  IF action='ADMIN_ADJUST' THEN
    SELECT * INTO adjustment FROM nanivio_communication_adjustments WHERE request_id=(payload->>'requestId')::uuid;
    IF FOUND THEN
      IF adjustment.user_id<>uid OR adjustment.actor_id<>payload->>'actorId'
        OR adjustment.resource<>kind OR adjustment.delta<>(payload->>'delta')::numeric
        OR adjustment.reason<>payload->>'reason' THEN RAISE EXCEPTION 'Adjustment retry does not match'; END IF;
      RETURN jsonb_build_object('success',true,'alreadyApplied',true);
    END IF;
    IF NOT paid THEN RETURN jsonb_build_object('success',false,'error','Select an account with an active paid communication term.'); END IF;
    quantity:=(payload->>'delta')::numeric;
    IF quantity IS NULL OR quantity=0 OR abs(quantity)>10000000 OR quantity::text IN ('NaN','Infinity','-Infinity')
      OR length(trim(coalesce(payload->>'reason','')))<3 OR nullif(payload->>'actorId','') IS NULL
      OR kind NOT IN ('call','live','text') THEN RAISE EXCEPTION 'Invalid adjustment'; END IF;
    IF kind='call' THEN
      IF sub.voice_minutes_quota+quantity<sub.voice_minutes_used THEN RAISE EXCEPTION 'Cannot remove already consumed calling minutes'; END IF;
      UPDATE nanivio_subscriptions SET voice_minutes_quota=voice_minutes_quota+quantity WHERE subscription_id=sub.subscription_id;
    ELSIF kind='live' THEN
      IF sub.langpretation_minutes_remaining+quantity<0 THEN RAISE EXCEPTION 'Cannot remove already consumed Langpretation minutes'; END IF;
      UPDATE nanivio_subscriptions SET langpretation_minutes_quota=langpretation_minutes_quota+quantity,
        langpretation_minutes_remaining=langpretation_minutes_remaining+quantity WHERE subscription_id=sub.subscription_id;
    ELSE
      IF term.allowance+quantity<term.used THEN RAISE EXCEPTION 'Cannot remove already consumed text characters'; END IF;
      UPDATE nanivio_communication_text_terms SET allowance=allowance+quantity WHERE subscription_id=sub.subscription_id;
    END IF;
    INSERT INTO nanivio_communication_adjustments(request_id,user_id,actor_id,resource,delta,reason,subscription_id)
      VALUES((payload->>'requestId')::uuid,uid,payload->>'actorId',kind,quantity,payload->>'reason',sub.subscription_id);
    INSERT INTO nanivio_billing_audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES(payload->>'actorId','COMMUNICATION_ALLOWANCE_ADJUSTED','subscription',sub.subscription_id,
        jsonb_build_object('userId',uid,'resource',kind,'delta',quantity,'reason',payload->>'reason','requestId',payload->>'requestId'));
    RETURN jsonb_build_object('success',true,'paidUntil',sub.current_period_end);
  END IF;
  IF action='CONNECT' THEN
    UPDATE nanivio_communication_accounts
      SET first_connected_at=coalesce(first_connected_at,now()),
          trial_ends_at=coalesce(trial_ends_at,now()+make_interval(days=>(cfg->>'callTrialDays')::int))
      WHERE user_id=uid RETURNING * INTO account;
  END IF;
  trial_left:=CASE WHEN account.first_connected_at IS NULL THEN NULL
    ELSE greatest(0,extract(epoch FROM account.trial_ends_at-now())) END;
  IF action IN ('ACCESS','CONNECT') THEN
    RETURN jsonb_build_object('success',true,'policy',cfg-'plans',
      'trialStartedAt',account.first_connected_at,'trialEndsAt',account.trial_ends_at,
      'callSecondsRemaining',CASE WHEN trial_left IS NULL OR trial_left>0 THEN NULL
        ELSE greatest(0,coalesce(sub.voice_minutes_quota-sub.voice_minutes_used,0))*60 END,
      'liveTrialSecondsRemaining',coalesce(account.live_trial_remaining,(cfg->>'liveTrialMinutes')::numeric*60),
      'textCharactersRemaining',CASE WHEN paid THEN greatest(0,term.allowance-term.used) ELSE 0 END,
      'translatedSecondsRemaining',CASE WHEN paid THEN greatest(0,sub.langpretation_minutes_remaining)*60 ELSE 0 END,
      'paid',paid,'paidUntil',CASE WHEN paid THEN sub.current_period_end ELSE NULL END,
      'sharedCallMinutes',CASE WHEN paid THEN greatest(0,sub.voice_minutes_quota-sub.voice_minutes_used) ELSE 0 END);
  END IF;
  IF eid IS NULL OR length(eid)>160 THEN RAISE EXCEPTION 'A bounded usage event is required'; END IF;
  SELECT * INTO receipt FROM nanivio_communication_reservations WHERE event_id=eid FOR UPDATE;
  IF FOUND AND receipt.user_id<>uid THEN RAISE EXCEPTION 'Usage event owner mismatch'; END IF;
  IF action IN ('COMMIT','RELEASE') THEN
    IF receipt.event_id IS NULL THEN RAISE EXCEPTION 'Usage reservation not found'; END IF;
    IF receipt.status='RELEASED' AND action='COMMIT' THEN
      RETURN jsonb_build_object('success',false,'code','USAGE_RESERVATION_EXPIRED','error','The usage reservation expired. Please try again.');
    END IF;
    IF receipt.status<>'RESERVED' THEN RETURN jsonb_build_object('success',true,'alreadyFinalized',true); END IF;
    keep:=CASE WHEN action='RELEASE' THEN 0 ELSE coalesce((payload->>'used')::numeric,receipt.amount) END;
    IF keep<0 OR keep>receipt.amount OR keep::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid settled usage'; END IF;
    quantity:=receipt.amount-keep;
    IF receipt.source='live_trial' THEN
      UPDATE nanivio_communication_accounts SET live_trial_remaining=live_trial_remaining+quantity WHERE user_id=uid;
    ELSIF receipt.resource='text' THEN
      UPDATE nanivio_communication_text_terms SET used=greatest(0,used-quantity) WHERE subscription_id=receipt.subscription_id;
    ELSIF receipt.resource='call' AND receipt.source='subscription' THEN
      UPDATE nanivio_subscriptions SET voice_minutes_used=greatest(0,voice_minutes_used-quantity/60) WHERE subscription_id=receipt.subscription_id;
    ELSIF receipt.resource IN ('live','note') AND receipt.source='subscription' THEN
      UPDATE nanivio_subscriptions SET langpretation_minutes_used=greatest(0,langpretation_minutes_used-quantity/60),
        langpretation_minutes_remaining=least(langpretation_minutes_quota,langpretation_minutes_remaining+quantity/60)
        WHERE subscription_id=receipt.subscription_id;
    END IF;
    UPDATE nanivio_communication_reservations SET status=CASE WHEN keep=0 THEN 'RELEASED' ELSE 'COMMITTED' END,amount=keep WHERE event_id=eid;
    RETURN jsonb_build_object('success',true,'used',keep);
  END IF;
  IF action<>'RESERVE' OR kind NOT IN ('call','live','note','text') THEN RAISE EXCEPTION 'Invalid usage action'; END IF;
  quantity:=(payload->>'amount')::numeric;
  IF quantity IS NULL OR quantity<=0 OR quantity>50000 OR quantity::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid usage quantity'; END IF;
  IF receipt.event_id IS NOT NULL THEN
    IF receipt.resource<>kind OR receipt.requested<>quantity THEN RAISE EXCEPTION 'Usage event does not match request'; END IF;
    RETURN jsonb_build_object('success',receipt.status<>'RELEASED','alreadyReserved',true,'amount',receipt.amount);
  END IF;
  IF kind='call' AND trial_left>0 THEN remaining:=trial_left; origin:='call_trial';
  ELSIF kind='live' AND coalesce(account.live_trial_remaining,(cfg->>'liveTrialMinutes')::numeric*60)>0 THEN
    remaining:=coalesce(account.live_trial_remaining,(cfg->>'liveTrialMinutes')::numeric*60); origin:='live_trial';
    UPDATE nanivio_communication_accounts SET live_trial_remaining=remaining WHERE user_id=uid;
  ELSIF paid THEN
    origin:='subscription';
    remaining:=CASE WHEN kind='call' THEN greatest(0,sub.voice_minutes_quota-sub.voice_minutes_used)*60
      WHEN kind='text' THEN greatest(0,term.allowance-term.used)
      ELSE greatest(0,sub.langpretation_minutes_remaining)*60 END;
    remaining:=least(remaining,extract(epoch FROM sub.current_period_end-now())*CASE WHEN kind IN ('call','live') THEN 1 ELSE 1000000 END);
  ELSE remaining:=0; END IF;
  granted:=CASE WHEN kind IN ('call','live') THEN least(quantity,remaining) ELSE quantity END;
  IF remaining<=0 OR granted>remaining THEN
    RETURN jsonb_build_object('success',false,'code','SUBSCRIPTION_REQUIRED',
      'error',CASE WHEN kind='call' THEN 'Your calling trial or minutes have ended. Subscribe to make calls; receiving calls and ordinary chat remain free.'
        ELSE 'A Langpretation subscription with available allowance is required. Original messages remain free.' END);
  END IF;
  IF origin='live_trial' THEN
    UPDATE nanivio_communication_accounts SET live_trial_remaining=live_trial_remaining-granted WHERE user_id=uid;
  ELSIF kind='text' THEN
    UPDATE nanivio_communication_text_terms SET used=used+granted WHERE subscription_id=sub.subscription_id;
  ELSIF origin='subscription' AND kind='call' THEN
    UPDATE nanivio_subscriptions SET voice_minutes_used=voice_minutes_used+granted/60 WHERE subscription_id=sub.subscription_id;
  ELSIF origin='subscription' THEN
    UPDATE nanivio_subscriptions SET langpretation_minutes_used=langpretation_minutes_used+granted/60,
      langpretation_minutes_remaining=greatest(0,langpretation_minutes_remaining-granted/60) WHERE subscription_id=sub.subscription_id;
  END IF;
  INSERT INTO nanivio_communication_reservations(event_id,user_id,resource,requested,amount,source,subscription_id)
    VALUES(eid,uid,kind,quantity,granted,origin,CASE WHEN origin='subscription' THEN sub.subscription_id ELSE NULL END);
  RETURN jsonb_build_object('success',true,'eventId',eid,'amount',granted,'source',origin);
END $$;
ALTER TABLE public.nanivio_communication_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_communication_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_communication_text_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_communication_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_communication_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_communication_policy,public.nanivio_communication_accounts,
  public.nanivio_communication_text_terms,public.nanivio_communication_reservations,public.nanivio_communication_adjustments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nanivio_communication_policy,public.nanivio_communication_accounts,
  public.nanivio_communication_text_terms,public.nanivio_communication_reservations,public.nanivio_communication_adjustments TO service_role;
REVOKE ALL ON FUNCTION public.nanivio_communication_access(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nanivio_capture_text_term() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_communication_access(text,jsonb) TO service_role;
SELECT true AS communication_policy_installed;
