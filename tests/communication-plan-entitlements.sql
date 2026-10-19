-- Run after migration 007 in an isolated/staging PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f tests/communication-plan-entitlements.sql
-- All regression data is rolled back.
BEGIN;
DO $$
DECLARE
  test_user TEXT := 'entitlement_test_' || gen_random_uuid()::text;
  plan_a JSONB;
  plan_b JSONB;
  initial JSONB;
  switched JSONB;
  usage JSONB;
  rows_count INTEGER;
  rejected BOOLEAN := false;
  renewed JSONB;
  paid_snapshot JSONB;
BEGIN
  plan_a := jsonb_build_object('userId', test_user, 'planId', 'test_a',
    'tier', 'a', 'planName', 'Test A', 'billingCycle', 'MONTHLY',
    'langpretationQuota', 100, 'voiceQuota', 100, 'malviQuota', 0);
  plan_b := plan_a || jsonb_build_object('planId', 'test_b', 'tier', 'b',
    'planName', 'Test B', 'langpretationQuota', 200);
  initial := nanivio_select_communication_plan(plan_a);
  IF initial->>'granted' <> 'true'
     OR (initial->'subscription'->>'langpretationMinutesRemaining')::numeric <> 100
     OR (initial->'subscription'->>'voiceMinutesQuota')::numeric <> 100
     OR (initial->'subscription'->>'pricePaid')::numeric <> 0
     OR (initial->'subscription'->>'currentPeriodEnd')::numeric
        - (initial->'subscription'->>'currentPeriodStart')::numeric <> 30::numeric * 86400000
     OR (initial->'subscription'->>'autoRenew')::boolean THEN
    RAISE EXCEPTION 'Initial grant has incorrect allowances or payment flags';
  END IF;
  switched := nanivio_select_communication_plan(plan_a);
  IF switched->>'granted' <> 'false'
     OR switched->'subscription' IS DISTINCT FROM initial->'subscription' THEN
    RAISE EXCEPTION 'Same-plan retry changed the original grant';
  END IF;
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 10, 'eventId', test_user || '_first', 'channel', 'AUDIO_CALL'));
  switched := nanivio_select_communication_plan(plan_b);
  IF (switched->'subscription'->>'langpretationMinutesRemaining')::numeric <> 190 THEN
    RAISE EXCEPTION 'Switch to B discarded consumed minutes';
  END IF;
  switched := nanivio_select_communication_plan(plan_a);
  IF (switched->'subscription'->>'langpretationMinutesRemaining')::numeric <> 90 THEN
    RAISE EXCEPTION 'A -> usage -> B -> A restored consumed allowance';
  END IF;
  switched := nanivio_select_communication_plan(plan_a || '{"billingCycle":"ANNUAL"}'::jsonb);
  IF switched->'subscription'->>'id' <> initial->'subscription'->>'id'
     OR switched->'subscription'->>'currentPeriodEnd' <> initial->'subscription'->>'currentPeriodEnd' THEN
    RAISE EXCEPTION 'Cycle switching created a new grant or extended the term';
  END IF;
  SELECT COUNT(*) INTO rows_count FROM nanivio_subscriptions WHERE user_id = test_user;
  IF rows_count <> 1 THEN RAISE EXCEPTION 'Repeated selections created multiple grants'; END IF;
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 90, 'eventId', test_user || '_remaining', 'channel', 'AUDIO_CALL'));
  IF (usage->>'remainingAllowance')::numeric <> 0 THEN RAISE EXCEPTION 'Quota was not exhausted'; END IF;
  BEGIN
    PERFORM nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
      'minutes', 1, 'eventId', test_user || '_exhausted', 'channel', 'AUDIO_CALL'));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Insufficient Langpretation allowance' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Exhausted usage was accepted'; END IF;
  switched := nanivio_select_communication_plan(plan_a);
  IF (switched->'subscription'->>'langpretationMinutesRemaining')::numeric <> 0 THEN
    RAISE EXCEPTION 'Reselection replenished an exhausted allowance';
  END IF;
  IF EXISTS (SELECT 1 FROM nanivio_invoices WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_payments WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_billing_transactions WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_wallet_ledger WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_credit_ledger WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_wallets WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Plan selection created a financial mutation';
  END IF;
  INSERT INTO nanivio_subscriptions(
    subscription_id, user_id, plan_id, tier, plan_name, billing_cycle, status,
    started_at, current_period_start, current_period_end, price_paid, currency,
    langpretation_minutes_quota, langpretation_minutes_remaining
  ) VALUES (
    test_user || '_paid_pack', test_user, 'test_pack', 'minutes_pack',
    'Purchased test minutes', 'ONE_OFF', 'ACTIVE', NOW(), NOW(),
    NOW() + INTERVAL '30 days', 10, 'GHS', 20, 20
  );
  SELECT to_jsonb(s) INTO paid_snapshot FROM nanivio_subscriptions s
   WHERE subscription_id = test_user || '_paid_pack';
  switched := nanivio_select_communication_plan(plan_a);
  IF paid_snapshot IS DISTINCT FROM (
    SELECT to_jsonb(s) FROM nanivio_subscriptions s
     WHERE subscription_id = test_user || '_paid_pack'
  ) THEN RAISE EXCEPTION 'Plan selection mutated a paid minute pack'; END IF;
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 1, 'eventId', test_user || '_paid_usage', 'channel', 'AUDIO_CALL'));
  IF NOT EXISTS (
    SELECT 1 FROM nanivio_subscriptions
     WHERE subscription_id = test_user || '_paid_pack'
       AND status = 'ACTIVE' AND langpretation_minutes_remaining = 19
  ) THEN RAISE EXCEPTION 'Purchased pack was cancelled, reset or unavailable'; END IF;

  -- Expiry must exclude the old grant from consumption even when it has quota.
  UPDATE nanivio_subscriptions
     SET current_period_end = NOW() - INTERVAL '1 second',
         langpretation_minutes_remaining = 50
   WHERE subscription_id = initial->'subscription'->>'id';
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 19, 'eventId', test_user || '_pack_remaining', 'channel', 'AUDIO_CALL'));
  IF (usage->>'remainingAllowance')::numeric <> 0 THEN
    RAISE EXCEPTION 'Expired grant was included in available allowance';
  END IF;
  rejected := false;
  BEGIN
    PERFORM nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
      'minutes', 1, 'eventId', test_user || '_expired', 'channel', 'AUDIO_CALL'));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Insufficient Langpretation allowance' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expired allowance funded new usage'; END IF;
  IF EXISTS (SELECT 1 FROM nanivio_usage_events WHERE event_id = test_user || '_expired') THEN
    RAISE EXCEPTION 'Rejected usage left a completed event';
  END IF;

  -- One new annual grant after expiry; old consumption and the paid row survive.
  SELECT to_jsonb(s) INTO paid_snapshot FROM nanivio_subscriptions s
   WHERE subscription_id = test_user || '_paid_pack';
  renewed := nanivio_select_communication_plan(plan_a || '{"billingCycle":"ANNUAL"}'::jsonb);
  IF renewed->>'granted' <> 'true'
     OR renewed->'subscription'->>'id' = initial->'subscription'->>'id'
     OR (renewed->'subscription'->>'langpretationMinutesRemaining')::numeric <> 100
     OR (renewed->'subscription'->>'langpretationMinutesUsed')::numeric <> 0
     OR (renewed->'subscription'->>'currentPeriodEnd')::numeric
        - (renewed->'subscription'->>'currentPeriodStart')::numeric <> 365::numeric * 86400000 THEN
    RAISE EXCEPTION 'Expiry did not grant exactly one fresh annual term';
  END IF;
  switched := nanivio_select_communication_plan(plan_a || '{"billingCycle":"ANNUAL"}'::jsonb);
  IF switched->>'granted' <> 'false'
     OR switched->'subscription' IS DISTINCT FROM renewed->'subscription' THEN
    RAISE EXCEPTION 'Renewal retry granted additional minutes';
  END IF;
  SELECT COUNT(*) INTO rows_count FROM nanivio_subscriptions
   WHERE user_id = test_user AND left(subscription_id, 11) = 'comm_grant_';
  IF rows_count <> 2 THEN RAISE EXCEPTION 'Expiry created an incorrect number of grants'; END IF;
  IF NOT EXISTS (SELECT 1 FROM nanivio_subscriptions
    WHERE subscription_id = initial->'subscription'->>'id'
      AND status = 'CANCELLED' AND langpretation_minutes_used = 100
      AND langpretation_minutes_remaining = 50) THEN
    RAISE EXCEPTION 'Renewal discarded historical usage';
  END IF;
  IF paid_snapshot IS DISTINCT FROM (
    SELECT to_jsonb(s) FROM nanivio_subscriptions s
     WHERE subscription_id = test_user || '_paid_pack'
  ) THEN RAISE EXCEPTION 'Renewal mutated a paid minute pack'; END IF;

  -- Retrying an old event after renewal must not charge the fresh term.
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 10, 'eventId', test_user || '_first', 'channel', 'AUDIO_CALL'));
  IF usage->>'duplicate' <> 'true'
     OR (usage->>'remainingAllowance')::numeric <> 100 THEN
    RAISE EXCEPTION 'Historical usage retry consumed renewed allowance';
  END IF;

  -- With both sources available, consume a sooner-expiring paid pack first.
  INSERT INTO nanivio_subscriptions(
    subscription_id, user_id, plan_id, tier, plan_name, billing_cycle, status,
    started_at, current_period_start, current_period_end, price_paid, currency,
    langpretation_minutes_quota, langpretation_minutes_remaining
  ) VALUES (
    test_user || '_early_pack', test_user, 'test_pack', 'minutes_pack',
    'Soon-expiring purchased minutes', 'ONE_OFF', 'ACTIVE', NOW(), NOW(),
    NOW() + INTERVAL '1 day', 5, 'GHS', 5, 5
  );
  usage := nanivio_langpretation_usage(jsonb_build_object('userId', test_user,
    'minutes', 2, 'eventId', test_user || '_early_usage', 'channel', 'AUDIO_CALL'));
  IF NOT EXISTS (SELECT 1 FROM nanivio_subscriptions
    WHERE subscription_id = test_user || '_early_pack'
      AND langpretation_minutes_used = 2 AND langpretation_minutes_remaining = 3)
     OR NOT EXISTS (SELECT 1 FROM nanivio_subscriptions
       WHERE subscription_id = renewed->'subscription'->>'id'
         AND langpretation_minutes_used = 0 AND langpretation_minutes_remaining = 100) THEN
    RAISE EXCEPTION 'Consumption did not prioritize the earliest-expiring allowance';
  END IF;
  IF EXISTS (SELECT 1 FROM nanivio_invoices WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_payments WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_billing_transactions WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_wallet_ledger WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_credit_ledger WHERE user_id = test_user)
     OR EXISTS (SELECT 1 FROM nanivio_wallets WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Renewal or allowance usage created a financial mutation';
  END IF;
  RAISE NOTICE 'Communication entitlement regression checks passed';
END;
$$;
ROLLBACK;
