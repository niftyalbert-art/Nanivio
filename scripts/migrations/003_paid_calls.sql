-- Paid per-minute expert calls
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_calls_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_call_rate numeric(18,4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_call_currency text;

CREATE TABLE IF NOT EXISTS call_sessions (
  id serial PRIMARY KEY,
  caller_user_id integer NOT NULL,
  expert_user_id integer NOT NULL,
  chat_id text NOT NULL,
  channel text NOT NULL,
  kind text NOT NULL DEFAULT 'video',
  rate_per_minute numeric(18,4) NOT NULL,
  currency_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  billed_minutes integer,
  total_amount numeric(18,4),
  fee_amount numeric(18,4),
  settlement_transfer_id integer,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions (status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller ON call_sessions (caller_user_id, created_at);

COMMIT;

-- Exactly one active billing session per caller (guards concurrent create race)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_call_sessions_active_caller ON call_sessions (caller_user_id) WHERE status = 'active';
