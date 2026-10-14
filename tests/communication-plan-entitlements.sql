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
BEGIN
  plan_a := jsonb_build_object('userId', test_user, 'planId', 'test_a',
    'tier', 'a', 'planName', 'Test A', 'billingCycle', 'MONTHLY',
    'langpretationQuota', 100, 'voiceQuota', 100, 'malviQuota', 0);
  plan_b := plan_a || jsonb_build_object('planId', 'test_b', 'tier', 'b',
    'planName', 'Test B', 'langpretationQuota', 200);
  initial := nanivio_select_communication_plan(plan_a);
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
  RAISE NOTICE 'Communication entitlement regression checks passed';
END;
$$;
ROLLBACK;
