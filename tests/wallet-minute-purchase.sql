BEGIN;
DO $$
DECLARE
  test_user TEXT := 'wallet_test_' || gen_random_uuid()::text;
  intent JSONB;
  result JSONB;
  balance NUMERIC;
  rejected BOOLEAN := false;
BEGIN
  intent := jsonb_build_object('userId', test_user, 'currency', 'GHS',
    'minutes', 20, 'price', 10, 'subscriptionId', test_user || '_pack',
    'transactionId', test_user || '_transaction', 'referenceId', test_user || '_reference',
    'paymentMethod', 'Nanivio credit', 'validityDays', 30);
  BEGIN
    PERFORM nanivio_billing_command('COMMUNICATION_MINUTES_FROM_WALLET', intent);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Insufficient Nanivio credit' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Insufficient funds granted minutes'; END IF;
  IF EXISTS(SELECT 1 FROM nanivio_subscriptions WHERE user_id = test_user)
     OR EXISTS(SELECT 1 FROM nanivio_payments WHERE user_id = test_user)
     OR EXISTS(SELECT 1 FROM nanivio_wallet_ledger WHERE user_id = test_user)
     OR EXISTS(SELECT 1 FROM nanivio_billing_transactions WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Rejected purchase created financial records or allowance';
  END IF;
  INSERT INTO nanivio_wallets(user_id, account_type, currency, available)
  VALUES(test_user, 'COMMUNICATION', 'GHS', 15);
  result := nanivio_billing_command('COMMUNICATION_MINUTES_FROM_WALLET', intent);
  SELECT available INTO balance FROM nanivio_wallets
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  IF balance <> 5 THEN RAISE EXCEPTION 'Wallet was not debited exactly once'; END IF;
  IF NOT EXISTS(SELECT 1 FROM nanivio_subscriptions WHERE user_id = test_user
    AND langpretation_minutes_remaining = 20) THEN RAISE EXCEPTION 'Paid allowance missing'; END IF;
  IF EXISTS(SELECT 1 FROM nanivio_payments WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Wallet purchase invented an external payment';
  END IF;
  result := nanivio_billing_command('COMMUNICATION_MINUTES_FROM_WALLET', intent);
  SELECT available INTO balance FROM nanivio_wallets
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  IF balance <> 5 OR (SELECT COUNT(*) FROM nanivio_wallet_ledger WHERE user_id = test_user) <> 1 THEN
    RAISE EXCEPTION 'Retry deducted the wallet again';
  END IF;
  IF (SELECT SUM(langpretation_minutes_remaining) FROM nanivio_subscriptions WHERE user_id = test_user) <> 20 THEN
    RAISE EXCEPTION 'Retry granted duplicate minutes';
  END IF;
  intent := jsonb_build_object('userId', test_user, 'currency', 'GHS',
    'price', 6, 'tier', 'premium', 'planId', 'test_malvi',
    'planName', 'Test Malvi', 'billingCycle', 'MONTHLY',
    'transactionId', test_user || '_malvi_transaction',
    'referenceId', test_user || '_malvi_reference', 'paymentMethod', 'Nanivio credit');
  rejected := false;
  BEGIN
    PERFORM nanivio_billing_command('MALVI_SUBSCRIPTION_FROM_WALLET', intent);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Insufficient Nanivio credit' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected OR EXISTS(SELECT 1 FROM nanivio_malvi_subscriptions WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Insufficient funds granted a Malvi subscription';
  END IF;
  UPDATE nanivio_wallets SET available = 15
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  result := nanivio_billing_command('MALVI_SUBSCRIPTION_FROM_WALLET', intent);
  result := nanivio_billing_command('MALVI_SUBSCRIPTION_FROM_WALLET', intent);
  SELECT available INTO balance FROM nanivio_wallets
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  IF balance <> 9 OR (SELECT COUNT(*) FROM nanivio_malvi_subscriptions WHERE user_id = test_user) <> 1
     OR EXISTS(SELECT 1 FROM nanivio_payments WHERE user_id = test_user) THEN
    RAISE EXCEPTION 'Malvi wallet purchase duplicated value or invented an external payment';
  END IF;
  -- Simulate the server's verified external fulfillment data only in this
  -- rolled-back test database; this is not a real provider confirmation.
  result := nanivio_billing_command('MALVI_SUBSCRIPTION', intent ||
    jsonb_build_object('transactionId', test_user || '_external_transaction',
      'referenceId', test_user || '_external_reference', 'paymentMethod', 'Paystack Payment Gateway'));
  SELECT available INTO balance FROM nanivio_wallets
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  IF balance <> 9 OR NOT EXISTS(
    SELECT 1 FROM nanivio_payments WHERE user_id = test_user
     AND provider_reference = test_user || '_external_reference' AND provider = 'paystack'
  ) THEN RAISE EXCEPTION 'External fulfillment used the wallet purchase path'; END IF;
  -- Verified minute-pack delivery uses its separate external-payment command,
  -- never a wallet debit. Replay must not add another allowance or payment.
  intent := jsonb_build_object('userId', test_user, 'currency', 'GHS',
    'minutes', 60, 'price', 55, 'validityDays', 30,
    'subscriptionId', test_user || '_paid_pack',
    'transactionId', test_user || '_paid_pack_transaction',
    'referenceId', test_user || '_paid_pack_reference',
    'paymentMethod', 'Paystack Payment Gateway');
  result := nanivio_billing_command('COMMUNICATION_MINUTES_PURCHASE', intent);
  result := nanivio_billing_command('COMMUNICATION_MINUTES_PURCHASE', intent);
  SELECT available INTO balance FROM nanivio_wallets
   WHERE user_id = test_user AND account_type = 'COMMUNICATION' AND currency = 'GHS';
  IF balance <> 9 THEN RAISE EXCEPTION 'Verified minute delivery debited the wallet'; END IF;
  IF (SELECT langpretation_minutes_remaining FROM nanivio_subscriptions
      WHERE subscription_id = test_user || '_paid_pack') <> 60 THEN
    RAISE EXCEPTION 'Verified minute delivery repeated the allowance';
  END IF;
  IF (SELECT COUNT(*) FROM nanivio_payments WHERE user_id = test_user
      AND provider_reference = test_user || '_paid_pack_reference'
      AND amount = 55 AND currency = 'GHS' AND provider = 'paystack') <> 1
     OR (SELECT COUNT(*) FROM nanivio_billing_transactions WHERE user_id = test_user
      AND reference_id = test_user || '_paid_pack_reference') <> 1
     OR (SELECT COUNT(*) FROM nanivio_invoices WHERE user_id = test_user
      AND transaction_reference = test_user || '_paid_pack_reference') <> 1 THEN
    RAISE EXCEPTION 'Verified minute delivery duplicated or lost its financial records';
  END IF;
  RAISE NOTICE 'Wallet minute purchase regression checks passed';
END;
$$;
ROLLBACK;
