-- Nanivio Phase 2: normalized, transactional financial ledger.
-- Run after migrations/001_billing_persistence.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nanivio_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('COMMUNICATION','FINTECH')),
  currency TEXT NOT NULL,
  available NUMERIC(20,6) NOT NULL DEFAULT 0,
  reserved NUMERIC(20,6) NOT NULL DEFAULT 0,
  promotional NUMERIC(20,6) NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_type, currency)
);
CREATE INDEX IF NOT EXISTS idx_nanivio_wallets_user ON nanivio_wallets(user_id);

CREATE TABLE IF NOT EXISTS nanivio_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  wallet_id UUID NOT NULL REFERENCES nanivio_wallets(id),
  user_id TEXT NOT NULL,
  account_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(20,6) NOT NULL,
  currency TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_wallet_ledger_user_created ON nanivio_wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nanivio_wallet_ledger_reference ON nanivio_wallet_ledger(reference_id);

CREATE TABLE IF NOT EXISTS nanivio_billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL UNIQUE,
  reference_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  quantity NUMERIC(20,6) NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC(20,6) NOT NULL,
  subtotal NUMERIC(20,6) NOT NULL,
  platform_fee NUMERIC(20,6) NOT NULL DEFAULT 0,
  provider_fee NUMERIC(20,6) NOT NULL DEFAULT 0,
  tax NUMERIC(20,6) NOT NULL DEFAULT 0,
  discount NUMERIC(20,6) NOT NULL DEFAULT 0,
  credit_applied NUMERIC(20,6) NOT NULL DEFAULT 0,
  total NUMERIC(20,6) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_method TEXT,
  pricing_version_id TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nanivio_billing_transactions_user ON nanivio_billing_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  next_billing_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  price_paid NUMERIC(20,6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  langpretation_minutes_quota NUMERIC(20,6) NOT NULL DEFAULT 0,
  langpretation_minutes_used NUMERIC(20,6) NOT NULL DEFAULT 0,
  langpretation_minutes_remaining NUMERIC(20,6) NOT NULL DEFAULT 0,
  voice_minutes_quota NUMERIC(20,6) NOT NULL DEFAULT 0,
  voice_minutes_used NUMERIC(20,6) NOT NULL DEFAULT 0,
  malvi_units_quota NUMERIC(20,6) NOT NULL DEFAULT 0,
  malvi_units_used NUMERIC(20,6) NOT NULL DEFAULT 0,
  provider_customer_code TEXT,
  provider_subscription_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_subscriptions_user ON nanivio_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS nanivio_credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  balance NUMERIC(20,6) NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nanivio_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  credit_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  source TEXT NOT NULL,
  balance_after NUMERIC(20,6) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_credit_ledger_user ON nanivio_credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  subtotal NUMERIC(20,6) NOT NULL,
  tax_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(20,6) NOT NULL DEFAULT 0,
  discount_total NUMERIC(20,6) NOT NULL DEFAULT 0,
  credit_total NUMERIC(20,6) NOT NULL DEFAULT 0,
  total NUMERIC(20,6) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_method TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_nanivio_invoices_user ON nanivio_invoices(user_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  amount NUMERIC(20,6) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT,
  purpose TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_reference)
);


CREATE TABLE IF NOT EXISTS nanivio_malvi_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  next_billing_at TIMESTAMPTZ NOT NULL,
  price_paid NUMERIC(20,6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  video_minutes_allowed NUMERIC(20,6) NOT NULL DEFAULT 0,
  video_minutes_used NUMERIC(20,6) NOT NULL DEFAULT 0,
  voice_minutes_allowed NUMERIC(20,6) NOT NULL DEFAULT 0,
  voice_minutes_used NUMERIC(20,6) NOT NULL DEFAULT 0,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_malvi_sub_user ON nanivio_malvi_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS nanivio_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  session_id TEXT,
  source_language TEXT,
  target_language TEXT,
  provider TEXT,
  input_units NUMERIC(20,6) NOT NULL DEFAULT 0,
  output_units NUMERIC(20,6) NOT NULL DEFAULT 0,
  audio_seconds NUMERIC(20,6) NOT NULL DEFAULT 0,
  credits_consumed NUMERIC(20,6) NOT NULL DEFAULT 0,
  cost_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_usage_events_user ON nanivio_usage_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_billing_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remaining normalized financial records. These are intentionally append-only for
-- money-impacting history; operational status changes are represented as new rows
-- or explicit status transitions rather than rewriting ledger history.
CREATE TABLE IF NOT EXISTS nanivio_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  payment_reference TEXT,
  transaction_id TEXT,
  amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  provider TEXT,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nanivio_refunds_user ON nanivio_refunds(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id TEXT NOT NULL UNIQUE,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC(20,6) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL,
  explanation TEXT,
  status TEXT NOT NULL,
  resolution TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_disputes_user ON nanivio_disputes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nanivio_provider_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  gross_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(20,6) NOT NULL DEFAULT 0,
  provider_net NUMERIC(20,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nanivio_provider_earnings_provider ON nanivio_provider_earnings(provider_id, created_at DESC);


-- One transaction for all critical money mutations. Application code calls this RPC,
-- so transfers and charges cannot be split across independent HTTP writes.
CREATE OR REPLACE FUNCTION nanivio_billing_command(command_name TEXT, payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_user TEXT := payload->>'userId';
  p_currency TEXT := upper(COALESCE(payload->>'currency','GHS'));
  p_account TEXT := upper(COALESCE(payload->>'accountType','COMMUNICATION'));
  p_amount NUMERIC := COALESCE((payload->>'amount')::numeric,0);
  p_ref TEXT := COALESCE(payload->>'referenceId', 'NV-' || gen_random_uuid()::text);
  p_tx TEXT := COALESCE(payload->>'transactionId', 'tx_' || gen_random_uuid()::text);
  w_sender nanivio_wallets%ROWTYPE;
  w_recipient nanivio_wallets%ROWTYPE;
  w_comm nanivio_wallets%ROWTYPE;
  sub_row nanivio_subscriptions%ROWTYPE;
  v_minutes NUMERIC;
  v_price NUMERIC;
  v_plan JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_invoice_id TEXT;
  v_invoice_no TEXT;
  v_remaining NUMERIC;
BEGIN
  IF command_name IN ('FINTECH_TO_COMMUNICATION','P2P_TRANSFER') AND p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Every money-impacting command is idempotent by transactionId. This prevents
  -- duplicate credits/debits if a browser retries or a payment provider retries.
  IF command_name <> 'ENSURE_WALLET' AND EXISTS (SELECT 1 FROM nanivio_billing_transactions WHERE transaction_id=p_tx) THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'transactionId',p_tx,'referenceId',p_ref,'status','COMPLETED');
  END IF;

  IF command_name = 'LANGPRETATION_USAGE' AND payload->>'eventId' IS NOT NULL AND EXISTS (SELECT 1 FROM nanivio_usage_events WHERE event_id=payload->>'eventId') THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'eventId',payload->>'eventId');
  END IF;

  IF command_name = 'ENSURE_WALLET' THEN
    INSERT INTO nanivio_wallets(user_id,account_type,currency)
    VALUES(p_user,p_account,p_currency)
    ON CONFLICT(user_id,account_type,currency) DO NOTHING;
    RETURN jsonb_build_object('success',true);
  END IF;

  IF command_name = 'FINTECH_TO_COMMUNICATION' THEN
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'FINTECH',p_currency) ON CONFLICT DO NOTHING;
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'COMMUNICATION',p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_sender FROM nanivio_wallets WHERE user_id=p_user AND account_type='FINTECH' AND currency=p_currency FOR UPDATE;
    SELECT * INTO w_comm FROM nanivio_wallets WHERE user_id=p_user AND account_type='COMMUNICATION' AND currency=p_currency FOR UPDATE;
    IF w_sender.available < p_amount THEN RAISE EXCEPTION 'Insufficient Fintech balance'; END IF;
    UPDATE nanivio_wallets SET available=available-p_amount, version=version+1, updated_at=v_now WHERE id=w_sender.id;
    UPDATE nanivio_wallets SET available=available+p_amount, version=version+1, updated_at=v_now WHERE id=w_comm.id;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description,metadata)
    VALUES(p_tx,p_ref,w_sender.id,p_user,'FINTECH','DEBIT',p_amount,w_sender.available-p_amount,p_currency,'FINTECH_TO_COMMUNICATION','Fintech to Communication transfer',COALESCE(payload->'metadata','{}')),
          (p_tx,p_ref,w_comm.id,p_user,'COMMUNICATION','CREDIT',p_amount,w_comm.available+p_amount,p_currency,'COMMUNICATION_TOPUP','Fintech to Communication transfer',COALESCE(payload->'metadata','{}'));
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'FINTECH_TRANSFER','TRANSFER_AMOUNT',p_amount,p_currency,1,p_amount,p_amount,p_currency,'COMPLETED','Fintech to Communication Transfer',payload->>'notes');
    RETURN jsonb_build_object('success',true,'transferId',p_tx,'referenceId',p_ref,'userId',p_user,'amount',p_amount,'currency',p_currency,'fintechBalanceAfter',w_sender.available-p_amount,'communicationBalanceAfter',w_comm.available+p_amount,'status','COMPLETED','timestamp',extract(epoch from v_now)*1000);
  END IF;

  IF command_name = 'P2P_TRANSFER' THEN
    IF payload->>'toUserId' IS NULL OR payload->>'toUserId' = p_user THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,p_account,p_currency) ON CONFLICT DO NOTHING;
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(payload->>'toUserId',p_account,p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_sender FROM nanivio_wallets WHERE user_id=p_user AND account_type=p_account AND currency=p_currency FOR UPDATE;
    SELECT * INTO w_recipient FROM nanivio_wallets WHERE user_id=payload->>'toUserId' AND account_type=p_account AND currency=p_currency FOR UPDATE;
    IF w_sender.available < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE nanivio_wallets SET available=available-p_amount, version=version+1, updated_at=v_now WHERE id=w_sender.id;
    UPDATE nanivio_wallets SET available=available+p_amount, version=version+1, updated_at=v_now WHERE id=w_recipient.id;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description,metadata)
    VALUES(p_tx,p_ref,w_sender.id,p_user,p_account,'DEBIT',p_amount,w_sender.available-p_amount,p_currency,'P2P_TRANSFER','Peer transfer sent',jsonb_build_object('toUserId',payload->>'toUserId')),
          (p_tx,p_ref,w_recipient.id,payload->>'toUserId',p_account,'CREDIT',p_amount,w_recipient.available+p_amount,p_currency,'P2P_TRANSFER','Peer transfer received',jsonb_build_object('fromUserId',p_user));
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,CASE WHEN p_account='COMMUNICATION' THEN 'COMMUNICATION' ELSE 'FINTECH_TRANSFER' END,'TRANSFER_AMOUNT',p_amount,'currency',1,p_amount,p_amount,p_currency,'COMPLETED','Nanivio Value Transfer',payload->>'note');
    RETURN jsonb_build_object('success',true,'transferId',p_tx,'referenceId',p_ref,'fromUserId',p_user,'toUserId',payload->>'toUserId','toUserName',payload->>'toUserName','toNvId',payload->>'toNvId','amount',p_amount,'currency',p_currency,'accountType',p_account,'senderBalanceAfter',w_sender.available-p_amount,'recipientBalanceAfter',w_recipient.available+p_amount,'timestamp',extract(epoch from v_now)*1000,'status','COMPLETED');
  END IF;

  IF command_name = 'SUBSCRIPTION_FROM_WALLET' THEN
    p_price := COALESCE((payload->>'price')::numeric,0);
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'COMMUNICATION',p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_comm FROM nanivio_wallets WHERE user_id=p_user AND account_type='COMMUNICATION' AND currency=p_currency FOR UPDATE;
    IF p_price > 0 AND w_comm.available < p_price THEN RAISE EXCEPTION 'Insufficient Communication balance'; END IF;
    IF p_price > 0 THEN UPDATE nanivio_wallets SET available=available-p_price,version=version+1,updated_at=v_now WHERE id=w_comm.id; END IF;
    INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,next_billing_at,auto_renew,price_paid,currency,langpretation_minutes_quota,langpretation_minutes_remaining,voice_minutes_quota,malvi_units_quota)
    VALUES(payload->>'subscriptionId',p_user,payload->>'planId',payload->>'tier',payload->>'planName',payload->>'billingCycle','ACTIVE',v_now,v_now,(v_now + ((payload->>'periodDays')::int || ' days')::interval),(v_now + ((payload->>'periodDays')::int || ' days')::interval),true,p_price,p_currency,COALESCE((payload->>'langpretationQuota')::numeric,0),COALESCE((payload->>'langpretationQuota')::numeric,0),COALESCE((payload->>'voiceQuota')::numeric,0),COALESCE((payload->>'malviQuota')::numeric,0))
    ON CONFLICT(subscription_id) DO UPDATE SET status='ACTIVE',updated_at=v_now;
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'SUBSCRIPTION','BUSINESS_USAGE',1,CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 'year' ELSE 'month' END,p_price,p_price,p_price,p_currency,'COMPLETED',payload->>'paymentMethod','Subscription activation');
    IF p_price > 0 THEN INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description)
      VALUES(p_tx,p_ref,w_comm.id,p_user,'COMMUNICATION','DEBIT',p_price,w_comm.available-p_price,p_currency,'SUBSCRIPTION_PAYMENT','Subscription payment'); END IF;
    v_invoice_id := 'inv_' || replace(gen_random_uuid()::text,'-','');
    v_invoice_no := 'INV-NV-' || to_char(v_now,'YYYYMMDDHH24MISSMS');
    INSERT INTO nanivio_invoices(invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status,payment_method,issued_at,paid_at,due_date,items)
    VALUES(v_invoice_id,v_invoice_no,p_user,p_ref,p_price,p_price,p_currency,'PAID',payload->>'paymentMethod',v_now,v_now,v_now,COALESCE(payload->'items','[]'));
    SELECT * INTO sub_row FROM nanivio_subscriptions WHERE subscription_id=payload->>'subscriptionId';
    RETURN jsonb_build_object('success',true,'subscription',jsonb_build_object('id',sub_row.subscription_id,'userId',sub_row.user_id,'planId',sub_row.plan_id,'tier',sub_row.tier,'planName',sub_row.plan_name,'billingCycle',sub_row.billing_cycle,'status',sub_row.status,'startedAt',extract(epoch from sub_row.started_at)*1000,'currentPeriodStart',extract(epoch from sub_row.current_period_start)*1000,'currentPeriodEnd',extract(epoch from sub_row.current_period_end)*1000,'nextBillingAt',extract(epoch from sub_row.next_billing_at)*1000,'autoRenew',sub_row.auto_renew,'pricePaid',sub_row.price_paid,'currency',sub_row.currency,'langpretationMinutesQuota',sub_row.langpretation_minutes_quota,'langpretationMinutesUsed',sub_row.langpretation_minutes_used,'langpretationMinutesRemaining',sub_row.langpretation_minutes_remaining,'voiceMinutesQuota',sub_row.voice_minutes_quota,'voiceMinutesUsed',sub_row.voice_minutes_used,'malviUnitsQuota',sub_row.malvi_units_quota,'malviUnitsUsed',sub_row.malvi_units_used),'invoiceId',v_invoice_id,'invoiceNumber',v_invoice_no,'transactionId',p_tx);
  END IF;

  IF command_name = 'LANGPRETATION_USAGE' THEN
    v_minutes := GREATEST(COALESCE((payload->>'minutes')::numeric,0),0);
    IF v_minutes <= 0 THEN RAISE EXCEPTION 'Usage must be greater than zero'; END IF;
    INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,currency)
    VALUES('auto_'||p_user,p_user,'free','free','Free Basic Tier','MONTHLY','ACTIVE',v_now,v_now,v_now + interval '30 days','GHS')
    ON CONFLICT DO NOTHING;
    SELECT * INTO sub_row FROM nanivio_subscriptions WHERE user_id=p_user AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
    v_remaining := LEAST(sub_row.langpretation_minutes_remaining,v_minutes);
    UPDATE nanivio_subscriptions SET langpretation_minutes_remaining=langpretation_minutes_remaining-v_remaining,langpretation_minutes_used=langpretation_minutes_used+v_remaining,updated_at=v_now WHERE id=sub_row.id;
    INSERT INTO nanivio_usage_events(event_id,user_id,service,session_id,source_language,target_language,provider,input_units,audio_seconds,credits_consumed,status,metadata)
    VALUES(COALESCE(payload->>'eventId','use_'||gen_random_uuid()::text),p_user,'LANGPRETATION',payload->>'sessionId',payload->>'sourceLang',payload->>'targetLang',payload->>'provider',v_minutes,COALESCE((payload->>'audioSeconds')::numeric,v_minutes*60),v_remaining,'COMPLETED',COALESCE(payload->'metadata','{}'));
    RETURN jsonb_build_object('success',true,'deductedFromQuota',v_remaining,'deductedFromBalance',0,'remainingAllowance',sub_row.langpretation_minutes_remaining-v_remaining,'minutesUsed',sub_row.langpretation_minutes_used+v_remaining);
  END IF;


  IF command_name = 'COMMUNICATION_MINUTES_FROM_WALLET' THEN
    v_minutes := COALESCE((payload->>'minutes')::numeric,0);
    p_price := COALESCE((payload->>'price')::numeric,0);
    IF v_minutes <= 0 THEN RAISE EXCEPTION 'Minutes must be greater than zero'; END IF;
    IF p_price < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'COMMUNICATION',p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_comm FROM nanivio_wallets WHERE user_id=p_user AND account_type='COMMUNICATION' AND currency=p_currency FOR UPDATE;
    IF w_comm.available < p_price THEN RAISE EXCEPTION 'Insufficient Nanivio credit'; END IF;
    IF p_price > 0 THEN UPDATE nanivio_wallets SET available=available-p_price,version=version+1,updated_at=v_now WHERE id=w_comm.id; END IF;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description,metadata)
    VALUES(p_tx,p_ref,w_comm.id,p_user,'COMMUNICATION','DEBIT',p_price,w_comm.available-p_price,p_currency,'MINUTES_PURCHASE','Nanivio credit used for communication minutes',COALESCE(payload->'metadata','{}'));
    INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,next_billing_at,auto_renew,price_paid,currency,langpretation_minutes_quota,langpretation_minutes_remaining,voice_minutes_quota)
    VALUES(payload->>'subscriptionId',p_user,'plan_individual_premium','individual_premium','Individual Premium Minutes Pack','MONTHLY','ACTIVE',v_now,v_now,(v_now + ((COALESCE((payload->>'validityDays')::int,30)) || ' days')::interval),(v_now + ((COALESCE((payload->>'validityDays')::int,30)) || ' days')::interval),false,p_price,p_currency,v_minutes,v_minutes,v_minutes)
    ON CONFLICT(subscription_id) DO UPDATE SET langpretation_minutes_quota=nanivio_subscriptions.langpretation_minutes_quota+EXCLUDED.langpretation_minutes_quota,langpretation_minutes_remaining=nanivio_subscriptions.langpretation_minutes_remaining+EXCLUDED.langpretation_minutes_remaining,voice_minutes_quota=nanivio_subscriptions.voice_minutes_quota+EXCLUDED.voice_minutes_quota,current_period_end=GREATEST(nanivio_subscriptions.current_period_end,EXCLUDED.current_period_end),next_billing_at=GREATEST(COALESCE(nanivio_subscriptions.next_billing_at,EXCLUDED.next_billing_at),EXCLUDED.next_billing_at),status='ACTIVE',updated_at=v_now;
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'COMMUNICATION','CALL_MINUTES',v_minutes,'minute',CASE WHEN v_minutes=0 THEN 0 ELSE p_price/v_minutes END,p_price,p_price,p_currency,'COMPLETED',payload->>'paymentMethod','Communication minutes purchased with Nanivio credit');
    RETURN jsonb_build_object('success',true,'transactionId',p_tx,'referenceId',p_ref,'balanceAfter',w_comm.available-p_price,'allowance',v_minutes,'status','COMPLETED');
  END IF;

  IF command_name = 'MALVI_SUBSCRIPTION_FROM_WALLET' THEN
    p_price := COALESCE((payload->>'price')::numeric,0);
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'COMMUNICATION',p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_comm FROM nanivio_wallets WHERE user_id=p_user AND account_type='COMMUNICATION' AND currency=p_currency FOR UPDATE;
    IF w_comm.available < p_price THEN RAISE EXCEPTION 'Insufficient Nanivio credit'; END IF;
    IF p_price > 0 THEN UPDATE nanivio_wallets SET available=available-p_price,version=version+1,updated_at=v_now WHERE id=w_comm.id; END IF;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description,metadata)
    VALUES(p_tx,p_ref,w_comm.id,p_user,'COMMUNICATION','DEBIT',p_price,w_comm.available-p_price,p_currency,'MALVI_SUBSCRIPTION','Nanivio credit used for Malvi AI Ecosystem subscription',COALESCE(payload->'metadata','{}'));
    INSERT INTO nanivio_malvi_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,next_billing_at,price_paid,currency,video_minutes_allowed,voice_minutes_allowed)
    VALUES('malvi_'||p_ref,p_user,COALESCE(payload->>'planId','malvi_'||payload->>'tier'),payload->>'tier',COALESCE(payload->>'planName',payload->>'tier'),payload->>'billingCycle','ACTIVE',v_now,v_now,(v_now + ((CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 365 ELSE 30 END) || ' days')::interval),(v_now + ((CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 365 ELSE 30 END) || ' days')::interval),p_price,p_currency,COALESCE((payload->>'videoMinutesAllowed')::numeric,0),COALESCE((payload->>'voiceMinutesAllowed')::numeric,0));
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'MALVI_AI','MALVI_REQUESTS',1,CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 'year' ELSE 'month' END,p_price,p_price,p_price,p_currency,'COMPLETED',payload->>'paymentMethod','Malvi AI Ecosystem subscription purchased with Nanivio credit');
    RETURN jsonb_build_object('success',true,'transactionId',p_tx,'referenceId',p_ref,'balanceAfter',w_comm.available-p_price,'status','COMPLETED');
  END IF;

  IF command_name = 'COMMUNICATION_MINUTES_PURCHASE' THEN
    v_minutes := COALESCE((payload->>'minutes')::numeric,0);
    p_price := COALESCE((payload->>'price')::numeric,0);
    IF v_minutes <= 0 THEN RAISE EXCEPTION 'Minutes must be greater than zero'; END IF;
    INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
    VALUES(p_user,COALESCE(payload->>'provider','paystack'),p_ref,p_price,p_currency,'PAID','COMMUNICATION_MINUTES',COALESCE(payload->'metadata','{}'),v_now)
    ON CONFLICT(provider,provider_reference) DO NOTHING;
    INSERT INTO nanivio_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,next_billing_at,auto_renew,price_paid,currency,langpretation_minutes_quota,langpretation_minutes_remaining,voice_minutes_quota)
    VALUES(payload->>'subscriptionId',p_user,'plan_individual_premium','individual_premium','Individual Premium Minutes Pack','MONTHLY','ACTIVE',v_now,v_now,(v_now + ((COALESCE((payload->>'validityDays')::int,30)) || ' days')::interval),(v_now + ((COALESCE((payload->>'validityDays')::int,30)) || ' days')::interval),false,p_price,p_currency,v_minutes,v_minutes,v_minutes)
    ON CONFLICT(subscription_id) DO UPDATE SET
      langpretation_minutes_quota=nanivio_subscriptions.langpretation_minutes_quota+EXCLUDED.langpretation_minutes_quota,
      langpretation_minutes_remaining=nanivio_subscriptions.langpretation_minutes_remaining+EXCLUDED.langpretation_minutes_remaining,
      voice_minutes_quota=nanivio_subscriptions.voice_minutes_quota+EXCLUDED.voice_minutes_quota,
      current_period_end=GREATEST(nanivio_subscriptions.current_period_end,EXCLUDED.current_period_end),
      next_billing_at=GREATEST(COALESCE(nanivio_subscriptions.next_billing_at,EXCLUDED.next_billing_at),EXCLUDED.next_billing_at),
      status='ACTIVE',updated_at=v_now;
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'COMMUNICATION','CALL_MINUTES',v_minutes,'minute',CASE WHEN v_minutes=0 THEN 0 ELSE p_price/v_minutes END,p_price,p_price,p_currency,'COMPLETED',payload->>'paymentMethod','Communication minutes purchased');
    v_invoice_id := 'inv_' || replace(gen_random_uuid()::text,'-','');
    v_invoice_no := 'INV-MIN-' || to_char(v_now,'YYYYMMDDHH24MISSMS');
    INSERT INTO nanivio_invoices(invoice_id,invoice_number,user_id,transaction_reference,subtotal,total,currency,status,payment_method,issued_at,paid_at,due_date,items)
    VALUES(v_invoice_id,v_invoice_no,p_user,p_ref,p_price,p_price,p_currency,'PAID',payload->>'paymentMethod',v_now,v_now,v_now,COALESCE(payload->'items','[]'));
    SELECT * INTO sub_row FROM nanivio_subscriptions WHERE subscription_id=payload->>'subscriptionId';
    RETURN jsonb_build_object('success',true,'subscription',jsonb_build_object('id',sub_row.subscription_id,'userId',sub_row.user_id,'planId',sub_row.plan_id,'tier',sub_row.tier,'planName',sub_row.plan_name,'billingCycle',sub_row.billing_cycle,'status',sub_row.status,'startedAt',extract(epoch from sub_row.started_at)*1000,'currentPeriodStart',extract(epoch from sub_row.current_period_start)*1000,'currentPeriodEnd',extract(epoch from sub_row.current_period_end)*1000,'nextBillingAt',extract(epoch from sub_row.next_billing_at)*1000,'autoRenew',sub_row.auto_renew,'pricePaid',sub_row.price_paid,'currency',sub_row.currency,'langpretationMinutesQuota',sub_row.langpretation_minutes_quota,'langpretationMinutesUsed',sub_row.langpretation_minutes_used,'langpretationMinutesRemaining',sub_row.langpretation_minutes_remaining,'voiceMinutesQuota',sub_row.voice_minutes_quota,'voiceMinutesUsed',sub_row.voice_minutes_used,'malviUnitsQuota',sub_row.malvi_units_quota,'malviUnitsUsed',sub_row.malvi_units_used),'allowance',sub_row.langpretation_minutes_remaining,'expiryDate',extract(epoch from sub_row.current_period_end)*1000,'invoiceId',v_invoice_id,'invoiceNumber',v_invoice_no,'transactionId',p_tx);
  END IF;



  IF command_name = 'PAYSTACK_TOPUP' THEN
    INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
    VALUES(p_user,'paystack',p_ref,p_amount,p_currency,'PAID','COMMUNICATION_TOPUP',COALESCE(payload->'metadata','{}'),v_now)
    ON CONFLICT(provider,provider_reference) DO NOTHING;
    INSERT INTO nanivio_wallets(user_id,account_type,currency) VALUES(p_user,'COMMUNICATION',p_currency) ON CONFLICT DO NOTHING;
    SELECT * INTO w_comm FROM nanivio_wallets WHERE user_id=p_user AND account_type='COMMUNICATION' AND currency=p_currency FOR UPDATE;
    UPDATE nanivio_wallets SET available=available+p_amount,version=version+1,updated_at=v_now WHERE id=w_comm.id;
    INSERT INTO nanivio_wallet_ledger(transaction_id,reference_id,wallet_id,user_id,account_type,direction,amount,balance_after,currency,entry_type,description)
    VALUES(p_tx,p_ref,w_comm.id,p_user,'COMMUNICATION','CREDIT',p_amount,w_comm.available+p_amount,p_currency,'PAYSTACK_TOPUP','Verified Paystack communication wallet top-up');
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'COMMUNICATION','BALANCE_TOPUP',p_amount,p_currency,1,p_amount,p_amount,p_currency,'COMPLETED','Paystack Payment Gateway','Verified Paystack top-up');
    RETURN jsonb_build_object('success',true,'transactionId',p_tx,'referenceId',p_ref,'balanceAfter',w_comm.available+p_amount);
  END IF;

  IF command_name = 'MALVI_SUBSCRIPTION' THEN
    p_price := COALESCE((payload->>'price')::numeric,0);
    INSERT INTO nanivio_payments(user_id,provider,provider_reference,amount,currency,status,purpose,metadata,paid_at)
    VALUES(p_user,'paystack',p_ref,p_price,p_currency,'PAID','MALVI_SUBSCRIPTION',COALESCE(payload->'metadata','{}'),v_now)
    ON CONFLICT(provider,provider_reference) DO NOTHING;
    INSERT INTO nanivio_malvi_subscriptions(subscription_id,user_id,plan_id,tier,plan_name,billing_cycle,status,started_at,current_period_start,current_period_end,next_billing_at,price_paid,currency,video_minutes_allowed,voice_minutes_allowed)
    VALUES('malvi_'||p_ref,p_user,COALESCE(payload->>'planId','malvi_'||payload->>'tier'),payload->>'tier',COALESCE(payload->>'planName',payload->>'tier'),payload->>'billingCycle','ACTIVE',v_now,v_now,(v_now + ((CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 365 ELSE 30 END) || ' days')::interval),(v_now + ((CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 365 ELSE 30 END) || ' days')::interval),p_price,p_currency,COALESCE((payload->>'videoMinutesAllowed')::numeric,0),COALESCE((payload->>'voiceMinutesAllowed')::numeric,0))
    ON CONFLICT(subscription_id) DO UPDATE SET status='ACTIVE',updated_at=v_now;
    INSERT INTO nanivio_billing_transactions(transaction_id,reference_id,user_id,service_type,usage_type,quantity,unit,unit_price,subtotal,total,currency,status,payment_method,notes)
    VALUES(p_tx,p_ref,p_user,'MALVI_AI','MALVI_REQUESTS',1,CASE WHEN payload->>'billingCycle'='ANNUAL' THEN 'year' ELSE 'month' END,p_price,p_price,p_price,p_currency,'COMPLETED',payload->>'paymentMethod','Malvi subscription');
    SELECT * INTO sub_row FROM nanivio_subscriptions WHERE subscription_id=payload->>'subscriptionId';
    RETURN jsonb_build_object('success',true,'transactionId',p_tx,'referenceId',p_ref,'subscription',jsonb_build_object('id','malvi_'||p_ref,'userId',p_user,'planId',COALESCE(payload->>'planId','malvi_'||payload->>'tier'),'tier',payload->>'tier','planName',COALESCE(payload->>'planName',payload->>'tier'),'billingCycle',payload->>'billingCycle','status','ACTIVE','pricePaid',p_price,'currency',p_currency,'videoMinutesAllowed',COALESCE((payload->>'videoMinutesAllowed')::numeric,0),'videoMinutesUsed',0,'videoMinutesRemaining',COALESCE((payload->>'videoMinutesAllowed')::numeric,0),'voiceMinutesAllowed',COALESCE((payload->>'voiceMinutesAllowed')::numeric,0),'voiceMinutesUsed',0,'voiceMinutesRemaining',COALESCE((payload->>'voiceMinutesAllowed')::numeric,0),'autoRenew',true),'invoice',jsonb_build_object('invoiceId','persisted:'||p_ref,'invoiceNumber','INV-MALVI-'||to_char(v_now,'YYYYMMDDHH24MISSMS'),'userId',p_user,'transactionReference',p_ref,'total',p_price,'currency',p_currency,'status','PAID'));
  END IF;

  RAISE EXCEPTION 'Unknown billing command: %', command_name;
END;
$$;

REVOKE ALL ON FUNCTION nanivio_billing_command(TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nanivio_billing_command(TEXT,JSONB) TO service_role;


-- Financial tables are server-only. Browser roles must never be able to mutate
-- wallets, ledger entries, payments, subscriptions, invoices, or usage directly.
REVOKE ALL ON TABLE
  nanivio_wallets,
  nanivio_wallet_ledger,
  nanivio_billing_transactions,
  nanivio_subscriptions,
  nanivio_malvi_subscriptions,
  nanivio_credit_accounts,
  nanivio_credit_ledger,
  nanivio_invoices,
  nanivio_payments,
  nanivio_usage_events,
  nanivio_billing_audit_logs,
  nanivio_refunds,
  nanivio_disputes,
  nanivio_provider_earnings
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  nanivio_wallets,
  nanivio_wallet_ledger,
  nanivio_billing_transactions,
  nanivio_subscriptions,
  nanivio_malvi_subscriptions,
  nanivio_credit_accounts,
  nanivio_credit_ledger,
  nanivio_invoices,
  nanivio_payments,
  nanivio_usage_events,
  nanivio_billing_audit_logs,
  nanivio_refunds,
  nanivio_disputes,
  nanivio_provider_earnings
TO service_role;
