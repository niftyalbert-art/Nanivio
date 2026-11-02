-- Run after 002, 003, 005, 012 and 013 in the existing Supabase database.
-- Installs administrative operations only; running this file changes no balances.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS idx_malvi_admin_adjustment_reference
  ON public.malvi_credit_ledger(reference) WHERE source='ADMIN_ADJUSTMENT';
CREATE OR REPLACE FUNCTION public.nanivio_admin_malvi_overview(p_admin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n BIGINT; paid BIGINT; malvi_paid BIGINT; trials BIGINT; t TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM nanivio_users WHERE id=p_admin AND role='ADMIN' AND status='ACTIVE')
    THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT COUNT(*) INTO n FROM nanivio_users;
  SELECT COUNT(*) INTO paid FROM nanivio_users u WHERE EXISTS(
    SELECT 1 FROM nanivio_subscriptions s WHERE s.user_id=u.id AND s.status='ACTIVE'
      AND s.price_paid>0 AND s.current_period_start<=t AND s.current_period_end>t
    UNION ALL
    SELECT 1 FROM nanivio_malvi_subscriptions s WHERE s.user_id=u.id AND s.status='ACTIVE'
      AND s.price_paid>0 AND s.current_period_start<=t AND s.current_period_end>t);
  SELECT COUNT(*) INTO malvi_paid FROM nanivio_users u WHERE EXISTS(
    SELECT 1 FROM nanivio_malvi_subscriptions s WHERE s.user_id=u.id AND s.status='ACTIVE'
      AND s.price_paid>0 AND s.current_period_start<=t AND s.current_period_end>t);
  SELECT COUNT(*) INTO trials FROM nanivio_users u WHERE EXISTS(
    SELECT 1 FROM nanivio_malvi_subscriptions s WHERE s.user_id=u.id AND s.status='TRIAL'
      AND s.current_period_start<=t AND s.current_period_end>t);
  RETURN jsonb_build_object('totalUsers',n,'paidSubscribers',paid,'unsubscribedUsers',n-paid,
    'malviPaidSubscribers',malvi_paid,'malviTrialUsers',trials);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_admin_adjust_malvi_minutes(
  p_admin TEXT,p_request UUID,p_user TEXT,p_direction TEXT,p_mode TEXT,p_minutes INTEGER,
  p_cycle TEXT,p_reason TEXT,p_plan JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s nanivio_malvi_subscriptions%ROWTYPE; a malvi_credit_accounts%ROWTYPE;
  previous malvi_credit_ledger%ROWTYPE; op JSONB; result JSONB;
  ref TEXT := 'admin_malvi_'||p_request::TEXT;
  t TIMESTAMPTZ := clock_timestamp(); term_end TIMESTAMPTZ; available NUMERIC; delta NUMERIC;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM nanivio_users WHERE id=p_admin AND role='ADMIN' AND status='ACTIVE')
    THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_request IS NULL OR p_user IS NULL OR p_direction IS NULL OR p_direction NOT IN ('CREDIT','DEBIT')
    OR p_mode IS NULL OR p_mode NOT IN ('voice','avatar') OR p_minutes IS NULL OR p_minutes NOT BETWEEN 1 AND 525600
    OR p_cycle IS NULL OR p_cycle NOT IN ('MONTHLY','ANNUAL') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
    THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT'; END IF;
  -- The same first lock is used by live reservation/settlement commands.
  PERFORM 1 FROM nanivio_users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  op := jsonb_build_object('actor',p_admin,'user',p_user,'direction',p_direction,'mode',p_mode,
    'minutes',p_minutes,'cycle',p_cycle,'reason',btrim(p_reason),'planId',p_plan->>'id');
  SELECT * INTO previous FROM malvi_credit_ledger WHERE reference=ref AND source='ADMIN_ADJUSTMENT';
  IF FOUND THEN
    IF previous.metadata->'operation' IS DISTINCT FROM op THEN RAISE EXCEPTION 'ADJUSTMENT_CONFLICT'; END IF;
    RETURN previous.metadata->'result';
  END IF;
  SELECT * INTO s FROM nanivio_malvi_subscriptions WHERE user_id=p_user
    AND status IN ('ACTIVE','TRIAL') AND current_period_start<=t AND current_period_end>t
    ORDER BY current_period_start DESC,subscription_id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    IF p_direction='DEBIT' THEN RAISE EXCEPTION 'MALVI_PLAN_REQUIRED'; END IF;
    IF p_plan IS NULL OR COALESCE(p_plan->>'id','')='' OR COALESCE(p_plan->>'tier','')=''
      OR COALESCE(p_plan->>'name','')='' THEN RAISE EXCEPTION 'PUBLISHED_PLAN_REQUIRED'; END IF;
    term_end := t + CASE WHEN p_cycle='ANNUAL' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    INSERT INTO nanivio_malvi_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,
      started_at,current_period_start,current_period_end,next_billing_at,price_paid,currency,
      video_minutes_allowed,voice_minutes_allowed,auto_renew)
    VALUES('admin_malvi_'||p_request::TEXT,p_user,p_plan->>'id',p_plan->>'tier',p_plan->>'name',p_cycle,'ACTIVE',
      t,t,term_end,term_end,0,'USD',0,0,false) RETURNING * INTO s;
  ELSIF s.billing_cycle<>p_cycle THEN
    RAISE EXCEPTION 'MALVI_CYCLE_MISMATCH';
  END IF;
  IF p_mode='avatar' AND s.tier='malvi_voice' THEN RAISE EXCEPTION 'MALVI_AVATAR_NOT_INCLUDED'; END IF;
  INSERT INTO malvi_credit_accounts(user_id,credit_balance) VALUES(p_user,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO a FROM malvi_credit_accounts WHERE user_id=p_user FOR UPDATE;
  available := CASE WHEN p_mode='voice' THEN s.voice_minutes_allowed-s.voice_minutes_used
    ELSE s.video_minutes_allowed-s.video_minutes_used END;
  IF p_direction='DEBIT' AND (available<p_minutes OR a.credit_balance<p_minutes)
    THEN RAISE EXCEPTION 'MALVI_INSUFFICIENT_UNUSED_MINUTES'; END IF;
  delta := CASE WHEN p_direction='CREDIT' THEN p_minutes ELSE -p_minutes END;
  UPDATE malvi_credit_accounts SET credit_balance=credit_balance+delta,version=version+1,updated_at=t
    WHERE id=a.id RETURNING * INTO a;
  UPDATE nanivio_malvi_subscriptions SET
    voice_minutes_allowed=voice_minutes_allowed+CASE WHEN p_mode='voice' THEN delta ELSE 0 END,
    video_minutes_allowed=video_minutes_allowed+CASE WHEN p_mode='avatar' THEN delta ELSE 0 END,
    updated_at=t WHERE subscription_id=s.subscription_id RETURNING * INTO s;
  result := jsonb_build_object('userId',p_user,'direction',p_direction,'mode',p_mode,'minutes',p_minutes,
    'creditBalance',a.credit_balance,'billingCycle',s.billing_cycle,'periodEnd',s.current_period_end,'postedAt',t,
    'voiceMinutesRemaining',s.voice_minutes_allowed-s.voice_minutes_used,
    'avatarMinutesRemaining',s.video_minutes_allowed-s.video_minutes_used);
  INSERT INTO malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,metadata)
    VALUES(a.id,p_user,p_direction,p_minutes,'MALVI_MINUTES',ref,'ADMIN_ADJUSTMENT',
      jsonb_build_object('operation',op,'result',result));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.nanivio_admin_malvi_overview(TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nanivio_admin_adjust_malvi_minutes(TEXT,UUID,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_admin_malvi_overview(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.nanivio_admin_adjust_malvi_minutes(TEXT,UUID,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
