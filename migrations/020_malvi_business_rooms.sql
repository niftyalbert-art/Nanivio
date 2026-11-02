-- Run in the existing Supabase SQL editor. No purchased balances are changed.
BEGIN;
-- Snapshot capability rights when a new term is activated. Do not modify old
-- subscriptions, purchased minute amounts, prices or period dates.
ALTER TABLE public.nanivio_malvi_subscriptions ADD COLUMN IF NOT EXISTS capabilities JSONB;
CREATE OR REPLACE FUNCTION public.nanivio_snapshot_malvi_capabilities()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE catalogue JSONB; plan JSONB; purchased JSONB;
BEGIN
  IF NEW.capabilities IS NOT NULL THEN RETURN NEW; END IF;
  -- A verified payment was inserted in the same activation transaction before
  -- the subscription. Prefer its immutable checkout terms over a later edit.
  IF to_regclass('public.nanivio_payments') IS NOT NULL THEN
    EXECUTE 'SELECT metadata->''planSnapshot'' FROM public.nanivio_payments
      WHERE provider=''paystack'' AND purpose=''MALVI_SUBSCRIPTION'' AND status=''PAID''
      AND ''malvi_''||provider_reference=$1 LIMIT 1' INTO purchased USING NEW.subscription_id;
  END IF;
  IF jsonb_typeof(purchased->'capabilities')='array' THEN
    NEW.capabilities:=purchased->'capabilities';
    RETURN NEW;
  END IF;
  SELECT document INTO catalogue FROM nanivio_malvi_plan_catalog LIMIT 1;
  SELECT item INTO plan FROM jsonb_array_elements(catalogue->'snapshot'->'plans') item
    WHERE item->>'tier'=NEW.tier AND item->>'status'='PUBLISHED' LIMIT 1;
  NEW.capabilities := COALESCE(plan->'capabilities',
    CASE NEW.tier
      WHEN 'malvi_voice' THEN '["conversation","voice"]'::JSONB
      WHEN 'malvi_premium' THEN '["conversation","voice","avatar","memory","research","multimodal"]'::JSONB
      WHEN 'malvi_business' THEN '["conversation","voice","avatar","memory","research","multimodal","business"]'::JSONB
      ELSE '["conversation","voice","avatar"]'::JSONB END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_malvi_capabilities ON public.nanivio_malvi_subscriptions;
CREATE TRIGGER snapshot_malvi_capabilities BEFORE INSERT ON public.nanivio_malvi_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.nanivio_snapshot_malvi_capabilities();
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_business_rooms (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  member_ids TEXT[] NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  document JSONB NOT NULL CHECK (jsonb_typeof(document)='object'),
  invite_hash TEXT,
  invite_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cardinality(member_ids) BETWEEN 1 AND 12),
  CHECK (owner_id=ANY(member_ids))
);
CREATE INDEX IF NOT EXISTS nanivio_malvi_business_members
  ON public.nanivio_malvi_business_rooms USING GIN(member_ids);
CREATE UNIQUE INDEX IF NOT EXISTS nanivio_malvi_business_invite
  ON public.nanivio_malvi_business_rooms(invite_hash) WHERE invite_hash IS NOT NULL;
ALTER TABLE public.nanivio_malvi_business_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_business_rooms FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.nanivio_malvi_business_rooms FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.nanivio_malvi_business_rooms FROM authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE ON public.nanivio_malvi_business_rooms TO service_role;
  END IF;
END $$;
COMMIT;
SELECT to_regclass('public.nanivio_malvi_business_rooms') IS NOT NULL AS business_rooms_installed;
