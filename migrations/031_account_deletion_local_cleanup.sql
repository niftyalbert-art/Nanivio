-- No cleanup is executed by installing this file. Requires migration 030.
BEGIN;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS erased_at timestamptz;

-- Prevent late authorized HTTP/provider work from restoring private rows after
-- deactivation. The row lock serializes writes with the erasure transaction.
CREATE OR REPLACE FUNCTION public.nanivio_private_owner_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_status text; erased timestamptz;
BEGIN
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN RAISE EXCEPTION 'Private resource ownership cannot be reassigned'; END IF;
  SELECT status,erased_at INTO owner_status,erased FROM nanivio_users WHERE id=NEW.user_id FOR SHARE;
  IF erased IS NOT NULL OR (owner_status IS DISTINCT FROM 'ACTIVE' AND EXISTS(
    SELECT 1 FROM nanivio_deletion_jobs WHERE owner_id=NEW.user_id
      AND state IN ('queued','processing','needs_attention','completed')))
    THEN RAISE EXCEPTION 'Account is not active'; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nanivio_contacts','nanivio_user_settings','nanivio_notifications',
    'nanivio_user_applications','nanivio_malvi_messages','nanivio_malvi_memory_preferences'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS deletion_owner_fence ON public.%I',t);
      EXECUTE format('CREATE TRIGGER deletion_owner_fence BEFORE INSERT OR UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION nanivio_private_owner_active()',t);
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_erased_identity_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'ACTIVE' AND EXISTS(SELECT 1 FROM nanivio_deletion_jobs
    WHERE owner_id=OLD.id AND state IN ('queued','processing','needs_attention','completed'))
    AND (NEW.status='ACTIVE' OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id AND NEW.auth_user_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Erasure in progress cannot be reversed'; END IF;
  IF OLD.erased_at IS NOT NULL AND
    (NEW.erased_at IS NULL OR NEW.status IS DISTINCT FROM 'DEACTIVATED'
      OR (NEW.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id))
    THEN RAISE EXCEPTION 'Erased identity cannot be restored'; END IF;
  IF OLD.erased_at IS NOT NULL AND
    (to_jsonb(NEW)-ARRAY['auth_user_id','updated_at','wallet_balance_ghs','wallet_balance_usd'])
      IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['auth_user_id','updated_at','wallet_balance_ghs','wallet_balance_usd'])
    THEN RAISE EXCEPTION 'Erased personal data cannot be restored'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deletion_identity_fence ON public.nanivio_users;
CREATE TRIGGER deletion_identity_fence BEFORE UPDATE ON public.nanivio_users
  FOR EACH ROW EXECUTE FUNCTION public.nanivio_erased_identity_fence();

CREATE OR REPLACE FUNCTION public.nanivio_deletion_clean_local(p_request uuid,p_token uuid,p_verify_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  j nanivio_deletion_jobs%ROWTYPE; u record; c record; item record; t text; n bigint;
  primary_projection text; expected_value text; assignments text[] := '{}';
  private_tables text[] := ARRAY['nanivio_contacts','nanivio_user_settings','nanivio_notifications',
    'nanivio_user_applications','nanivio_malvi_messages','nanivio_malvi_memory_preferences',
    'nanivio_deletion_challenges'];
  retained_tables text[] := ARRAY['nanivio_deletion_requests','nanivio_deletion_jobs',
    'nanivio_subscriptions','nanivio_transactions','nanivio_invoices','nanivio_payments',
    'nanivio_billing_transactions','nanivio_credit_accounts','nanivio_credit_ledger',
    'nanivio_disputes','nanivio_refunds','nanivio_provider_earnings','nanivio_wallet_ledger','nanivio_wallets',
    'nanivio_malvi_subscriptions','malvi_credit_accounts','malvi_credit_ledger',
    'nanivio_usage_events','nanivio_usage_sessions','nanivio_paystack_orders',
    'nanivio_tron_invoices','nanivio_tron_receipts','nanivio_communication_accounts',
    'nanivio_communication_adjustments','nanivio_communication_reservations',
    'nanivio_communication_text_terms','nanivio_credit_purchase_requests',
    'nanivio_malvi_fleet_usage','nanivio_malvi_live_leases','nanivio_malvi_request_usage',
    'nanivio_paid_search_events','nanivio_pricing_consumption','nanivio_pricing_grants',
    'nanivio_pricing_usage_events','nanivio_balanced_terms','nanivio_balanced_pack_receipts',
    'nanivio_balanced_malvi_pack_leases'];
  allowed_columns text[] := ARRAY['id','nv_id','created_at','updated_at','erased_at','auth_user_id',
    'wallet_balance_ghs','wallet_balance_usd','name','status','role','my_language','app_language',
    'email','phone','initials','avatar','first_name','last_name','display_name','calling_code',
    'verification_status','last_login_at','online_visibility','profile_photo_visibility',
    'last_seen_visibility','read_receipts_enabled','username','status_message','expert_profile_id',
    'business_profile_id','driver_profile_id','country','state','city','is_verified'];
BEGIN
  SELECT * INTO j FROM nanivio_deletion_jobs WHERE request_id=p_request FOR UPDATE;
  IF NOT FOUND OR j.state<>'processing' OR j.lease_token IS DISTINCT FROM p_token
    OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Deletion lease lost'; END IF;
  IF NOT p_verify_only AND ((SELECT count(*) FROM nanivio_deletion_steps WHERE request_id=p_request
    AND step IN ('access','billing','storage','voice','stream') AND state='verified')<>5
    OR NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step='personal_data' AND state='started')) THEN RAISE EXCEPTION 'Prerequisite cleanup unverified'; END IF;
  IF p_verify_only AND ((SELECT count(*) FROM nanivio_deletion_steps WHERE request_id=p_request
    AND step IN ('access','billing','storage','voice','stream','personal_data','auth_identity') AND state='verified')<>7
    OR NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step='verification' AND state IN ('started','verified'))) THEN RAISE EXCEPTION 'Prerequisite cleanup unverified'; END IF;
  SELECT * INTO u FROM nanivio_users WHERE id=j.owner_id FOR UPDATE;
  IF NOT FOUND OR u.status IS DISTINCT FROM 'DEACTIVATED' THEN RAISE EXCEPTION 'Account must be frozen'; END IF;
  -- New owner-scoped resources are review blockers, not silently ignored.
  FOR c IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'nanivio_%'
      AND column_name IN ('user_id','owner_id')
    UNION SELECT rel.relname,att.attname FROM pg_constraint fk
      JOIN pg_class rel ON rel.oid=fk.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_attribute att ON att.attrelid=fk.conrelid AND att.attnum=ANY(fk.conkey)
      WHERE fk.contype='f' AND fk.confrelid='public.nanivio_users'::regclass
        AND ns.nspname='public' LOOP
    IF c.table_name=ANY(retained_tables) THEN
      IF c.table_name IN ('nanivio_deletion_requests','nanivio_deletion_jobs') THEN CONTINUE; END IF;
      -- Every retained row needs its own basis/expiry. A table name or a
      -- generic policy reference is not permission for blanket retention.
      SELECT string_agg(format('%L,r.%I',a.attname,a.attname),',' ORDER BY a.attnum)
        INTO primary_projection FROM pg_index i
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
        WHERE i.indrelid=to_regclass('public.'||c.table_name) AND i.indisprimary;
      IF primary_projection IS NULL THEN RAISE EXCEPTION 'Retained resource key requires review'; END IF;
      FOR item IN EXECUTE format('SELECT jsonb_build_object(%s) resource_key FROM public.%I r WHERE %I::text=$1',
        primary_projection,c.table_name,c.column_name) USING j.owner_id LOOP
        IF NOT EXISTS(SELECT 1 FROM nanivio_deletion_retention evidence
          WHERE evidence.request_id=p_request AND evidence.resource_table=c.table_name
            AND evidence.resource_key=item.resource_key
            AND (CASE WHEN evidence.hold_reference IS NOT NULL
              THEN evidence.hold_review_at>clock_timestamp()
              ELSE evidence.retain_until>clock_timestamp() END))
          THEN RAISE EXCEPTION 'Record retention evidence requires review'; END IF;
      END LOOP;
      CONTINUE;
    END IF;
    IF NOT p_verify_only AND c.table_name=ANY(private_tables) THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text=$1',c.table_name,c.column_name)
      INTO n USING j.owner_id;
    IF n>0 THEN
      -- Deleted voice tombstones contain no provider ID or usable voice.
      IF c.table_name='nanivio_voice_profiles' THEN
        EXECUTE 'SELECT count(*) FROM nanivio_voice_profiles WHERE owner_id=$1
          AND (state<>''deleted'' OR provider_voice_id IS NOT NULL OR creation_uncertain OR enabled)'
          INTO n USING j.owner_id;
        IF n=0 THEN CONTINUE; END IF;
      END IF;
      RAISE EXCEPTION 'Owned resources require reviewed cleanup';
    END IF;
  END LOOP;
  -- Even membership in someone else's room can embed personal/shared data.
  IF to_regclass('public.nanivio_malvi_business_rooms') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM nanivio_malvi_business_rooms WHERE $1=ANY(member_ids)' INTO n USING j.owner_id;
    IF n>0 THEN RAISE EXCEPTION 'Shared business resources require review'; END IF;
  END IF;
  IF p_verify_only AND (u.auth_user_id IS NOT NULL OR u.erased_at IS NULL)
    THEN RAISE EXCEPTION 'Identity cleanup unverified'; END IF;
  FOR c IN SELECT column_name,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nanivio_users' LOOP
    IF NOT c.column_name=ANY(allowed_columns) THEN RAISE EXCEPTION 'Profile schema requires review'; END IF;
    IF c.column_name=ANY(ARRAY['id','nv_id','created_at','auth_user_id','wallet_balance_ghs','wallet_balance_usd']) THEN CONTINUE; END IF;
    IF p_verify_only THEN
      IF c.column_name IN ('updated_at','erased_at') THEN
        IF (to_jsonb(u)->>c.column_name) IS NULL THEN RAISE EXCEPTION 'Erasure timestamp missing'; END IF;
        CONTINUE;
      END IF;
      expected_value:=CASE WHEN c.column_name='name' THEN 'Deleted account'
        WHEN c.column_name='status' THEN 'DEACTIVATED'
        WHEN c.column_name='role' THEN 'PERSONAL'
        WHEN c.column_name IN ('my_language','app_language') THEN 'en'
        WHEN c.column_name IN ('is_verified','read_receipts_enabled') THEN 'false'
        ELSE NULL END;
      IF (to_jsonb(u)->>c.column_name) IS DISTINCT FROM expected_value
        THEN RAISE EXCEPTION 'Personal profile data remains'; END IF;
      CONTINUE;
    END IF;
    assignments:=array_append(assignments,format('%I=%s',c.column_name,
      CASE WHEN c.column_name='updated_at' THEN 'now()'
        WHEN c.column_name='erased_at' THEN 'coalesce(erased_at,now())'
        WHEN c.column_name='name' THEN quote_literal('Deleted account')
        WHEN c.column_name='status' THEN quote_literal('DEACTIVATED')
        WHEN c.column_name='role' THEN quote_literal('PERSONAL')
        WHEN c.column_name IN ('my_language','app_language') THEN quote_literal('en')
        WHEN c.column_name IN ('is_verified','read_receipts_enabled') THEN 'false'
        ELSE 'NULL' END));
  END LOOP;
  IF p_verify_only THEN RETURN jsonb_build_object('verified',true); END IF;
  FOREACH t IN ARRAY private_tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I=$1',t,
        CASE WHEN t='nanivio_deletion_challenges' THEN 'owner_id' ELSE 'user_id' END) USING j.owner_id;
    END IF;
  END LOOP;
  IF to_regclass('public.nanivio_signup_email_challenges') IS NOT NULL THEN
    EXECUTE 'DELETE FROM nanivio_signup_email_challenges c WHERE
      (to_jsonb(c)->>''email'')=$1 OR (to_jsonb(c)->>''phone'')=$2' USING u.email,u.phone;
  END IF;
  IF to_regclass('public.nanivio_voice_profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM nanivio_voice_profiles WHERE owner_id=$1 AND state=''deleted''' USING j.owner_id;
  END IF;
  EXECUTE format('UPDATE nanivio_users SET %s WHERE id=$1',array_to_string(assignments,',')) USING j.owner_id;
  RETURN jsonb_build_object('cleaned',true);
END $$;
REVOKE ALL ON FUNCTION public.nanivio_private_owner_active(),public.nanivio_erased_identity_fence(),
  public.nanivio_deletion_clean_local(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_deletion_clean_local(uuid,uuid,boolean) TO service_role;
COMMIT;
SELECT true AS account_deletion_local_cleanup_installed;
