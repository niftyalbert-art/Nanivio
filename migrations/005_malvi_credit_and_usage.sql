-- Separate Malvi AI Ecosystem credit entitlement, independent from Nanivio credit.
CREATE TABLE IF NOT EXISTS public.malvi_credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL UNIQUE REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  credit_balance NUMERIC(18,6) NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.malvi_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES public.malvi_credit_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE RESTRICT, direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT','REVERSAL')),
  amount NUMERIC(18,6) NOT NULL CHECK(amount>0), credit_type TEXT NOT NULL, reference TEXT NOT NULL, source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,reference)
);
CREATE INDEX IF NOT EXISTS idx_malvi_credit_ledger_user ON public.malvi_credit_ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.nanivio_usage_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE RESTRICT, service TEXT NOT NULL, usage_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', currency TEXT, source_language TEXT, target_language TEXT, provider TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ, audio_seconds NUMERIC(18,3) NOT NULL DEFAULT 0,
  input_units NUMERIC(18,6) NOT NULL DEFAULT 0, output_units NUMERIC(18,6) NOT NULL DEFAULT 0, credits_reserved NUMERIC(18,6) NOT NULL DEFAULT 0,
  credits_consumed NUMERIC(18,6) NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_nanivio_usage_sessions_user ON public.nanivio_usage_sessions(user_id,started_at DESC);
CREATE OR REPLACE FUNCTION public.nanivio_malvi_credit_command(command_name TEXT,payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE uid TEXT := payload->>'userId'; amt NUMERIC := COALESCE((payload->>'amount')::NUMERIC,0); ref TEXT := payload->>'reference'; acct public.malvi_credit_accounts%ROWTYPE; newbal NUMERIC;
BEGIN
  IF uid IS NULL OR amt<=0 OR ref IS NULL THEN RAISE EXCEPTION 'Invalid Malvi credit command'; END IF;
  INSERT INTO public.malvi_credit_accounts(user_id) VALUES(uid) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO acct FROM public.malvi_credit_accounts WHERE user_id=uid FOR UPDATE;
  IF command_name='CREDIT' THEN newbal:=acct.credit_balance+amt;
  ELSIF command_name='DEBIT' THEN IF acct.credit_balance<amt THEN RAISE EXCEPTION 'Insufficient Malvi AI Ecosystem credit'; END IF; newbal:=acct.credit_balance-amt;
  ELSE RAISE EXCEPTION 'Unsupported Malvi credit command'; END IF;
  UPDATE public.malvi_credit_accounts SET credit_balance=newbal,version=version+1,updated_at=now() WHERE id=acct.id;
  INSERT INTO public.malvi_credit_ledger(account_id,user_id,direction,amount,credit_type,reference,source,status,metadata) VALUES(acct.id,uid,CASE WHEN command_name='CREDIT' THEN 'CREDIT' ELSE 'DEBIT' END,amt,COALESCE(payload->>'creditType','MALVI_USAGE'),ref,COALESCE(payload->>'source','MALVI'), 'POSTED',COALESCE(payload->'metadata','{}'::jsonb)) ON CONFLICT(user_id,reference) DO NOTHING;
  RETURN jsonb_build_object('success',true,'creditBalance',newbal,'reference',ref);
END $$;
