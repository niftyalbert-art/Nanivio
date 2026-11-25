-- Server access uses the Supabase service role, which bypasses RLS.
-- Browser roles (anon, authenticated) must never read or write these tables
-- through PostgREST with the public anon key.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'malvi_credit_accounts',
    'malvi_credit_ledger',
    'nanivio_balanced_malvi_pack_leases',
    'nanivio_balanced_pack_receipts',
    'nanivio_balanced_reservation_links',
    'nanivio_balanced_terms',
    'nanivio_billing_audit_logs',
    'nanivio_billing_state',
    'nanivio_billing_transactions',
    'nanivio_contacts',
    'nanivio_credit_accounts',
    'nanivio_credit_ledger',
    'nanivio_disputes',
    'nanivio_notifications',
    'nanivio_payments',
    'nanivio_paystack_events',
    'nanivio_paystack_orders',
    'nanivio_provider_earnings',
    'nanivio_refunds',
    'nanivio_usage_events',
    'nanivio_usage_sessions',
    'nanivio_user_settings',
    'nanivio_wallet_ledger',
    'nanivio_wallets'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
