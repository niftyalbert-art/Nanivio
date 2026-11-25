-- Official Nanivio Tech. Ghana contact details and QR choice, edited in the admin panel.
-- One row only; read and written by the server with the service role.
BEGIN;

CREATE TABLE IF NOT EXISTS public.nanivio_official_profile (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  address TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  whatsapp TEXT NOT NULL DEFAULT '' CHECK (length(whatsapp) <= 80),
  website TEXT NOT NULL DEFAULT '' CHECK (length(website) <= 200),
  qr_mode TEXT NOT NULL DEFAULT 'official' CHECK (qr_mode IN ('official','join')),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nanivio_official_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_official_profile FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.nanivio_official_profile TO service_role;

COMMIT;
