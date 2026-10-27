-- Persistent, server-only Malvi catalogue. Run in the existing Supabase project.
-- No existing subscription, wallet, purchase or allowance rows are modified.
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_plan_catalog (
  catalog_id TEXT PRIMARY KEY CHECK (catalog_id = 'primary'),
  version BIGINT NOT NULL CHECK (version >= 1),
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nanivio_malvi_plan_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_plan_catalog FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.nanivio_malvi_plan_catalog FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.nanivio_malvi_plan_catalog FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public.nanivio_malvi_plan_catalog TO service_role;
  END IF;
END $$;
