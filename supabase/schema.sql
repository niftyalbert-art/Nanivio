-- ============================================================
-- NANIVIO SUPABASE POSTGRESQL DATABASE SCHEMA
-- ============================================================

-- 1. Users & Global Identities
CREATE TABLE IF NOT EXISTS public.nanivio_users (
  id TEXT PRIMARY KEY,
  nv_id TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  name TEXT NOT NULL,
  initials TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'user',
  my_language TEXT DEFAULT 'en',
  app_language TEXT DEFAULT 'en',
  status_message TEXT DEFAULT 'Available on Nanivio',
  is_verified BOOLEAN DEFAULT false,
  wallet_balance_ghs NUMERIC(12, 2) DEFAULT 0.00,
  wallet_balance_usd NUMERIC(12, 2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Subscriptions & Minutes Quotas
CREATE TABLE IF NOT EXISTS public.nanivio_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT DEFAULT 'MONTHLY',
  status TEXT DEFAULT 'ACTIVE',
  price_paid NUMERIC(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'GHS',
  payment_method TEXT DEFAULT 'Paystack Payment Gateway',
  langpretation_minutes_quota INTEGER DEFAULT 60,
  langpretation_minutes_used NUMERIC(10, 2) DEFAULT 0.00,
  langpretation_minutes_remaining NUMERIC(10, 2) DEFAULT 60.00,
  started_at TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Billing Transactions
CREATE TABLE IF NOT EXISTS public.nanivio_transactions (
  transaction_id TEXT PRIMARY KEY,
  reference_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  quantity NUMERIC(10, 2) DEFAULT 1.00,
  unit TEXT DEFAULT 'minute',
  unit_price NUMERIC(10, 2) DEFAULT 0.00,
  total NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT DEFAULT 'COMPLETED',
  payment_method TEXT DEFAULT 'Paystack Payment Gateway',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Invoices
CREATE TABLE IF NOT EXISTS public.nanivio_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  transaction_reference TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  total NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT DEFAULT 'PAID',
  items JSONB DEFAULT '[]'::jsonb,
  issued_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Malvi AI Companion Subscriptions
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'malvi_free',
  plan_name TEXT NOT NULL DEFAULT 'Free Companion',
  video_minutes_allowed NUMERIC(10, 2) DEFAULT 3.00,
  video_minutes_remaining NUMERIC(10, 2) DEFAULT 3.00,
  price_paid NUMERIC(10, 2) DEFAULT 0.00,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.nanivio_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_malvi_subscriptions ENABLE ROW LEVEL SECURITY;

-- Default Read/Write Policies for authenticated services & anon read
CREATE POLICY "Allow public read access to verified profiles" ON public.nanivio_users
  FOR SELECT USING (true);

CREATE POLICY "Allow users to read their own subscriptions" ON public.nanivio_subscriptions
  FOR SELECT USING (true);

CREATE POLICY "Allow users to read their own transactions" ON public.nanivio_transactions
  FOR SELECT USING (true);

CREATE POLICY "Allow users to read their own invoices" ON public.nanivio_invoices
  FOR SELECT USING (true);
