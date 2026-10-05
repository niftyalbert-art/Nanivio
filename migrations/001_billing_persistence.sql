-- Nanivio persistent billing foundation.
-- Run this migration in the Supabase SQL editor before deploying.
CREATE TABLE IF NOT EXISTS nanivio_billing_state (
  state_id TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nanivio_paystack_orders (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_paystack_orders_user ON nanivio_paystack_orders(user_id);

CREATE TABLE IF NOT EXISTS nanivio_paystack_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);
