-- Persistent administrator-controlled Langpretation capability/provider overrides.
create table if not exists public.nanivio_langpretation_configs (
  code text primary key,
  active boolean not null default true,
  provider text,
  capability text,
  mt_provider text,
  tts_provider text,
  updated_at timestamptz not null default now()
);

alter table public.nanivio_langpretation_configs enable row level security;

-- This table is server-managed with the Supabase service role. No client policy is granted.
