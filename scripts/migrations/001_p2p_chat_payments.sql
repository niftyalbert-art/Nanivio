-- Idempotent migration: in-chat P2P transfers + money requests.
-- Applied by scripts/post-merge.sh (safe to re-run).

CREATE TABLE IF NOT EXISTS p2p_transfers (
  id              serial PRIMARY KEY,
  from_user_id    integer NOT NULL,
  to_user_id      integer NOT NULL,
  from_wallet_id  integer NOT NULL,
  to_wallet_id    integer NOT NULL,
  from_currency   text NOT NULL,
  to_currency     text NOT NULL,
  from_amount     numeric(18,4) NOT NULL,
  to_amount       numeric(18,4) NOT NULL,
  exchange_rate   numeric(18,6) NOT NULL,
  fee             numeric(18,4) NOT NULL DEFAULT '0',
  from_amount_usd numeric(18,4),
  status          text NOT NULL DEFAULT 'completed',
  note            text,
  chat_id         text,
  request_id      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2p_from_user ON p2p_transfers (from_user_id);
CREATE INDEX IF NOT EXISTS idx_p2p_to_user ON p2p_transfers (to_user_id);

CREATE TABLE IF NOT EXISTS money_requests (
  id                serial PRIMARY KEY,
  requester_user_id integer NOT NULL,
  payer_user_id     integer NOT NULL,
  chat_id           text NOT NULL,
  message_id        text,
  amount            numeric(18,4) NOT NULL,
  currency_code     text NOT NULL,
  note              text,
  status            text NOT NULL DEFAULT 'pending',
  transfer_id       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_money_requests_payer ON money_requests (payer_user_id);
