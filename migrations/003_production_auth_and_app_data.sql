-- Nanivio production identity/application persistence.
-- Supabase Auth owns passwords/sessions; these tables own Nanivio profile/application data.
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS calling_code TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS app_language TEXT DEFAULT 'en';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS online_visibility TEXT DEFAULT 'everyone';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS profile_photo_visibility TEXT DEFAULT 'everyone';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS last_seen_visibility TEXT DEFAULT 'everyone';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS status_message TEXT DEFAULT 'Available on Nanivio';
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS expert_profile_id TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS business_profile_id TEXT;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS driver_profile_id TEXT;

CREATE TABLE IF NOT EXISTS public.nanivio_user_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  application_type TEXT NOT NULL CHECK (application_type IN ('EXPERT','BUSINESS','DRIVER')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nanivio_user_applications_type_status ON public.nanivio_user_applications(application_type,status,created_at DESC);
ALTER TABLE public.nanivio_user_applications ENABLE ROW LEVEL SECURITY;
-- Replace permissive public policies from the original schema. Service-role server access bypasses RLS.
DROP POLICY IF EXISTS "Allow public read access to verified profiles" ON public.nanivio_users;
DROP POLICY IF EXISTS "Allow users to read their own subscriptions" ON public.nanivio_subscriptions;
DROP POLICY IF EXISTS "Allow users to read their own transactions" ON public.nanivio_transactions;
DROP POLICY IF EXISTS "Allow users to read their own invoices" ON public.nanivio_invoices;
DROP POLICY IF EXISTS "users_read_verified_profiles" ON public.nanivio_users;
DROP POLICY IF EXISTS "users_read_own_subscriptions" ON public.nanivio_subscriptions;
DROP POLICY IF EXISTS "users_read_own_transactions" ON public.nanivio_transactions;
DROP POLICY IF EXISTS "users_read_own_invoices" ON public.nanivio_invoices;
CREATE POLICY "users_read_verified_profiles" ON public.nanivio_users FOR SELECT USING (verification_status='VERIFIED' OR auth.uid()=auth_user_id);
CREATE POLICY "users_read_own_subscriptions" ON public.nanivio_subscriptions FOR SELECT USING (EXISTS (SELECT 1 FROM public.nanivio_users u WHERE u.id=user_id AND u.auth_user_id=auth.uid()));
CREATE POLICY "users_read_own_transactions" ON public.nanivio_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM public.nanivio_users u WHERE u.id=user_id AND u.auth_user_id=auth.uid()));
CREATE POLICY "users_read_own_invoices" ON public.nanivio_invoices FOR SELECT USING (EXISTS (SELECT 1 FROM public.nanivio_users u WHERE u.id=user_id AND u.auth_user_id=auth.uid()));
