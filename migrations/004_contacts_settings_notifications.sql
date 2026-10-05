CREATE TABLE IF NOT EXISTS public.nanivio_contacts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  contact_nv_id TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,contact_nv_id)
);
CREATE INDEX IF NOT EXISTS idx_nanivio_contacts_user ON public.nanivio_contacts(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.nanivio_user_settings (
  user_id TEXT PRIMARY KEY REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nanivio_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_notifications_user ON public.nanivio_notifications(user_id,created_at DESC);
