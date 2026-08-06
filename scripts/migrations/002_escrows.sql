-- Idempotent migration: escrow-held payments + audit trail.
-- Applied by scripts/post-merge.sh (safe to re-run).

CREATE TABLE IF NOT EXISTS escrows (
  id                serial PRIMARY KEY,
  buyer_user_id     integer NOT NULL,
  seller_user_id    integer NOT NULL,
  buyer_wallet_id   integer NOT NULL,
  amount            numeric(18,4) NOT NULL,
  currency_code     text NOT NULL,
  amount_usd        numeric(18,4),
  fee_amount        numeric(18,4),
  description       text NOT NULL,
  deadline          timestamptz,
  deadline_reminded boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'funded',
  disputed_by       integer,
  dispute_reason    text,
  resolved_by       text,
  chat_id           text NOT NULL,
  message_id        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows (buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows (status);

CREATE TABLE IF NOT EXISTS escrow_events (
  id         serial PRIMARY KEY,
  escrow_id  integer NOT NULL,
  actor_type text NOT NULL,
  actor_id   integer,
  action     text NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow ON escrow_events (escrow_id);
