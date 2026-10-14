-- Communication plan selection grants server-catalog allowances without payment.
-- Langpretation usage draws down all active entitlements, including purchased minute packs.

CREATE OR REPLACE FUNCTION nanivio_select_communication_plan(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_user TEXT := NULLIF(payload->>'userId', '');
  p_plan_id TEXT := NULLIF(payload->>'planId', '');
  p_tier TEXT := NULLIF(payload->>'tier', '');
  p_plan_name TEXT := NULLIF(payload->>'planName', '');
  p_cycle TEXT := upper(COALESCE(payload->>'billingCycle', 'MONTHLY'));
  p_currency TEXT := upper(COALESCE(payload->>'currency', 'GHS'));
  p_langpretation NUMERIC := COALESCE((payload->>'langpretationQuota')::numeric, 0);
  p_voice NUMERIC := COALESCE((payload->>'voiceQuota')::numeric, 0);
  p_malvi NUMERIC := COALESCE((payload->>'malviQuota')::numeric, 0);
  v_now TIMESTAMPTZ := NOW();
  v_end TIMESTAMPTZ;
  v_subscription_id TEXT;
  sub_row nanivio_subscriptions%ROWTYPE;
BEGIN
  IF p_user IS NULL OR p_plan_id IS NULL OR p_tier IS NULL OR p_plan_name IS NULL THEN
    RAISE EXCEPTION 'A user and configured communication plan are required';
  END IF;
  IF p_cycle NOT IN ('MONTHLY', 'ANNUAL') THEN RAISE EXCEPTION 'Unsupported billing cycle'; END IF;
  IF p_currency <> 'GHS' THEN RAISE EXCEPTION 'Unsupported communication plan currency'; END IF;
  IF p_langpretation < 0 OR p_voice < 0 OR p_malvi < 0 THEN RAISE EXCEPTION 'Plan allowances cannot be negative'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:' || p_user));
  v_end := v_now + CASE WHEN p_cycle = 'ANNUAL' THEN INTERVAL '365 days' ELSE INTERVAL '30 days' END;

  -- Reuse the durable grant for the entire term, across tier/cycle changes and
  -- cancellation. Neither switching nor reselecting can reset usage or extend expiry.
  SELECT * INTO sub_row
    FROM nanivio_subscriptions
   WHERE user_id = p_user
     AND left(subscription_id, 11) = 'comm_grant_'
     AND current_period_end > v_now
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    UPDATE nanivio_subscriptions
       SET plan_id = p_plan_id, tier = p_tier, plan_name = p_plan_name,
           billing_cycle = p_cycle, status = 'ACTIVE', auto_renew = false,
           langpretation_minutes_quota = p_langpretation,
           langpretation_minutes_remaining = GREATEST(0, p_langpretation - langpretation_minutes_used),
           voice_minutes_quota = p_voice, malvi_units_quota = p_malvi,
           updated_at = v_now
     WHERE id = sub_row.id
     RETURNING * INTO sub_row;
    INSERT INTO nanivio_billing_audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (
      p_user, 'COMMUNICATION_PLAN_CHANGED', 'SUBSCRIPTION', sub_row.subscription_id,
      jsonb_build_object('planId', p_plan_id, 'tier', p_tier, 'billingCycle', p_cycle,
        'consumedMinutesPreserved', sub_row.langpretation_minutes_used,
        'periodEndPreserved', sub_row.current_period_end)
    );
    RETURN jsonb_build_object(
      'success', true,
      'granted', false,
      'subscription', jsonb_build_object(
        'id', sub_row.subscription_id, 'userId', sub_row.user_id, 'planId', sub_row.plan_id,
        'tier', sub_row.tier, 'planName', sub_row.plan_name, 'billingCycle', sub_row.billing_cycle,
        'status', sub_row.status, 'startedAt', extract(epoch from sub_row.started_at) * 1000,
        'currentPeriodStart', extract(epoch from sub_row.current_period_start) * 1000,
        'currentPeriodEnd', extract(epoch from sub_row.current_period_end) * 1000,
        'nextBillingAt', extract(epoch from sub_row.next_billing_at) * 1000,
        'autoRenew', false, 'pricePaid', 0, 'currency', sub_row.currency,
        'langpretationMinutesQuota', sub_row.langpretation_minutes_quota,
        'langpretationMinutesUsed', sub_row.langpretation_minutes_used,
        'langpretationMinutesRemaining', sub_row.langpretation_minutes_remaining,
        'voiceMinutesQuota', sub_row.voice_minutes_quota,
        'voiceMinutesUsed', sub_row.voice_minutes_used,
        'malviUnitsQuota', sub_row.malvi_units_quota,
        'malviUnitsUsed', sub_row.malvi_units_used
      )
    );
  END IF;

  -- Replace only a prior self-service communication-plan grant. Purchased minute packs
  -- and historical payment-backed subscriptions are left untouched.
  UPDATE nanivio_subscriptions
     SET status = 'CANCELLED', auto_renew = false, next_billing_at = NULL, updated_at = v_now
   WHERE user_id = p_user
     AND left(subscription_id, 11) = 'comm_grant_'
     AND status = 'ACTIVE';

  v_subscription_id := 'comm_grant_' || gen_random_uuid()::text;
  INSERT INTO nanivio_subscriptions(
    subscription_id, user_id, plan_id, tier, plan_name, billing_cycle, status,
    started_at, current_period_start, current_period_end, next_billing_at, auto_renew,
    price_paid, currency, langpretation_minutes_quota, langpretation_minutes_remaining,
    voice_minutes_quota, malvi_units_quota
  ) VALUES (
    v_subscription_id, p_user, p_plan_id, p_tier, p_plan_name, p_cycle, 'ACTIVE',
    v_now, v_now, v_end, v_end, false, 0, p_currency, p_langpretation,
    p_langpretation, p_voice, p_malvi
  )
  RETURNING * INTO sub_row;

  INSERT INTO nanivio_billing_audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_user, 'COMMUNICATION_PLAN_SELECTED', 'SUBSCRIPTION', v_subscription_id,
    jsonb_build_object(
      'planId', p_plan_id, 'tier', p_tier, 'billingCycle', p_cycle,
      'langpretationMinutes', p_langpretation, 'voiceMinutes', p_voice,
      'malviUnits', p_malvi, 'pricePaid', 0, 'autoRenew', false
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'granted', true,
    'subscription', jsonb_build_object(
      'id', sub_row.subscription_id, 'userId', sub_row.user_id, 'planId', sub_row.plan_id,
      'tier', sub_row.tier, 'planName', sub_row.plan_name, 'billingCycle', sub_row.billing_cycle,
      'status', sub_row.status, 'startedAt', extract(epoch from sub_row.started_at) * 1000,
      'currentPeriodStart', extract(epoch from sub_row.current_period_start) * 1000,
      'currentPeriodEnd', extract(epoch from sub_row.current_period_end) * 1000,
      'nextBillingAt', extract(epoch from sub_row.next_billing_at) * 1000,
      'autoRenew', false, 'pricePaid', 0, 'currency', sub_row.currency,
      'langpretationMinutesQuota', sub_row.langpretation_minutes_quota,
      'langpretationMinutesUsed', sub_row.langpretation_minutes_used,
      'langpretationMinutesRemaining', sub_row.langpretation_minutes_remaining,
      'voiceMinutesQuota', sub_row.voice_minutes_quota,
      'voiceMinutesUsed', sub_row.voice_minutes_used,
      'malviUnitsQuota', sub_row.malvi_units_quota,
      'malviUnitsUsed', sub_row.malvi_units_used
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION nanivio_select_communication_plan(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nanivio_select_communication_plan(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION nanivio_langpretation_usage(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_user TEXT := NULLIF(payload->>'userId', '');
  v_minutes NUMERIC := GREATEST(COALESCE((payload->>'minutes')::numeric, 0), 0);
  v_event_id TEXT := COALESCE(payload->>'eventId', 'use_' || gen_random_uuid()::text);
  v_deducted NUMERIC := 0;
  v_remaining NUMERIC := 0;
  v_minutes_used NUMERIC := 0;
  v_now TIMESTAMPTZ := NOW();
  sub_row nanivio_subscriptions%ROWTYPE;
  existing_event nanivio_usage_events%ROWTYPE;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'Authenticated user is required'; END IF;
  IF v_minutes <= 0 THEN RAISE EXCEPTION 'Usage must be greater than zero'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('nanivio-entitlements:' || p_user));

  SELECT * INTO existing_event
    FROM nanivio_usage_events
   WHERE event_id = v_event_id
     AND user_id = p_user;
  IF FOUND THEN
    SELECT COALESCE(SUM(langpretation_minutes_remaining), 0),
           COALESCE(SUM(langpretation_minutes_used), 0)
      INTO v_remaining, v_minutes_used
      FROM nanivio_subscriptions
     WHERE user_id = p_user AND status IN ('ACTIVE', 'TRIAL') AND current_period_end > v_now;
    RETURN jsonb_build_object(
      'success', true, 'duplicate', true,
      'deductedFromQuota', COALESCE((existing_event.metadata->>'deductedFromQuota')::numeric, existing_event.credits_consumed, 0),
      'deductedFromBalance', 0, 'remainingAllowance', v_remaining,
      'minutesUsed', v_minutes_used
    );
  END IF;

  SELECT COALESCE(SUM(langpretation_minutes_remaining), 0)
    INTO v_remaining
    FROM nanivio_subscriptions
   WHERE user_id = p_user AND status IN ('ACTIVE', 'TRIAL') AND current_period_end > v_now;
  -- This RPC consumes allowance, not wallet money. Never report uncovered usage
  -- as successfully funded; paid-credit fallback needs a separate verified debit.
  IF v_remaining < v_minutes THEN
    RAISE EXCEPTION 'Insufficient Langpretation allowance';
  END IF;

  -- Consume the earliest-expiring allowances first; retain all other active quota rows.
  FOR sub_row IN
    SELECT * FROM nanivio_subscriptions
     WHERE user_id = p_user
       AND status IN ('ACTIVE', 'TRIAL')
       AND current_period_end > v_now
       AND langpretation_minutes_remaining > 0
     ORDER BY current_period_end ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_deducted >= v_minutes;
    DECLARE
      row_deduction NUMERIC := LEAST(sub_row.langpretation_minutes_remaining, v_minutes - v_deducted);
    BEGIN
      UPDATE nanivio_subscriptions
         SET langpretation_minutes_remaining = langpretation_minutes_remaining - row_deduction,
             langpretation_minutes_used = langpretation_minutes_used + row_deduction,
             updated_at = v_now
       WHERE id = sub_row.id;
      v_deducted := v_deducted + row_deduction;
    END;
  END LOOP;

  SELECT COALESCE(SUM(langpretation_minutes_remaining), 0),
         COALESCE(SUM(langpretation_minutes_used), 0)
    INTO v_remaining, v_minutes_used
    FROM nanivio_subscriptions
   WHERE user_id = p_user AND status IN ('ACTIVE', 'TRIAL') AND current_period_end > v_now;

  INSERT INTO nanivio_usage_events(
    event_id, user_id, service, session_id, source_language, target_language, provider,
    input_units, audio_seconds, credits_consumed, status, metadata
  ) VALUES (
    v_event_id, p_user, 'LANGPRETATION', payload->>'sessionId',
    payload->>'sourceLang', payload->>'targetLang', payload->>'provider',
    v_minutes, COALESCE((payload->>'audioSeconds')::numeric, v_minutes * 60),
    v_deducted, 'COMPLETED',
    COALESCE(payload->'metadata', '{}'::jsonb) || jsonb_build_object(
      'deductedFromQuota', v_deducted, 'deductedFromBalance', 0,
      'remainingAllowance', v_remaining, 'minutesUsed', v_minutes_used,
      'channel', payload->>'channel'
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'deductedFromQuota', v_deducted,
    'deductedFromBalance', 0, 'remainingAllowance', v_remaining,
    'minutesUsed', v_minutes_used
  );
END;
$$;

REVOKE ALL ON FUNCTION nanivio_langpretation_usage(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nanivio_langpretation_usage(JSONB) TO service_role;
