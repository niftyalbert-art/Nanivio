-- Run against an isolated PostgreSQL database after migrations 002, 007 and 008.
BEGIN;
DO $$
DECLARE
  p JSONB := '{"userId":"paystack_test_user","referenceId":"test_paid_ref","transactionId":"test_paid_tx","subscriptionId":"paid_test_sub","planId":"premium","tier":"individual_premium","planName":"Premium","billingCycle":"MONTHLY","price":145,"currency":"GHS","periodDays":30,"langpretationQuota":200,"voiceQuota":500,"malviQuota":500}';
  r JSONB;
  blocked BOOLEAN;
BEGIN
  INSERT INTO nanivio_wallets(user_id,account_type,currency,available)
    VALUES('paystack_test_user','COMMUNICATION','GHS',20);
  PERFORM nanivio_select_communication_plan(
    '{"userId":"paystack_test_user","planId":"free","tier":"free","planName":"Free","billingCycle":"MONTHLY","currency":"GHS","langpretationQuota":15}');
  r := nanivio_activate_paystack_subscription(p);
  IF r->>'success' <> 'true' THEN RAISE EXCEPTION 'Paid activation failed'; END IF;
  IF (SELECT available FROM nanivio_wallets WHERE user_id='paystack_test_user') <> 20 THEN
    RAISE EXCEPTION 'External payment incorrectly changed the wallet';
  END IF;
  IF (SELECT count(*) FROM nanivio_payments WHERE provider_reference='test_paid_ref') <> 1
    OR (SELECT count(*) FROM nanivio_invoices WHERE transaction_reference='test_paid_ref') <> 1 THEN
    RAISE EXCEPTION 'Payment or invoice missing';
  END IF;
  PERFORM nanivio_langpretation_usage(
    '{"userId":"paystack_test_user","minutes":10,"audioSeconds":600,"eventId":"test_paid_usage"}');
  IF (SELECT sum(langpretation_minutes_remaining) FROM nanivio_subscriptions WHERE user_id='paystack_test_user') <> 205 THEN
    RAISE EXCEPTION 'Paid allowance cannot fund Langpretation usage';
  END IF;
  r := nanivio_activate_paystack_subscription(p);
  IF r->>'alreadyFulfilled' <> 'true'
    OR (SELECT sum(langpretation_minutes_remaining) FROM nanivio_subscriptions WHERE user_id='paystack_test_user') <> 205
    OR (SELECT count(*) FROM nanivio_payments WHERE provider_reference='test_paid_ref') <> 1 THEN
    RAISE EXCEPTION 'Retry granted duplicate or replenished value';
  END IF;
  blocked := false;
  BEGIN
    PERFORM nanivio_activate_paystack_subscription(p || '{"userId":"another_user"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-account reference replay accepted'; END IF;
  blocked := false;
  BEGIN
    PERFORM nanivio_activate_paystack_subscription(p || '{"referenceId":"rollback_ref","subscriptionId":"rollback_sub"}'::jsonb);
  EXCEPTION WHEN unique_violation THEN blocked := true;
  END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM nanivio_payments WHERE provider_reference='rollback_ref')
    OR EXISTS(SELECT 1 FROM nanivio_subscriptions WHERE subscription_id='rollback_sub') THEN
    RAISE EXCEPTION 'Failed activation was not rolled back atomically';
  END IF;
  PERFORM nanivio_activate_paystack_subscription(p ||
    '{"referenceId":"annual_ref","transactionId":"annual_tx","subscriptionId":"annual_sub","billingCycle":"ANNUAL","periodDays":365,"price":1450}'::jsonb);
  IF NOT EXISTS(SELECT 1 FROM nanivio_subscriptions WHERE subscription_id='annual_sub'
    AND current_period_end=now()+interval '365 days' AND auto_renew=false AND price_paid=1450) THEN
    RAISE EXCEPTION 'Annual paid term is incorrect';
  END IF;
  IF has_function_privilege('anon','nanivio_activate_paystack_subscription(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','nanivio_activate_paystack_subscription(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Client roles can grant paid subscriptions';
  END IF;
  RAISE NOTICE 'PASS: verified paid grants, usage, retries, ownership, annual terms, atomic rollback and permissions';
END $$;
ROLLBACK;
