-- Install in the existing Supabase project before releasing password recovery.
-- Setup only: no emails, passwords, account statuses or deletion jobs are changed.
BEGIN;
CREATE TABLE public.nanivio_password_recovery (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  user_id text REFERENCES public.nanivio_users(id),
  purpose text NOT NULL CHECK (purpose IN ('pkce','reset')),
  ip_hash text,
  subject_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX nanivio_password_recovery_rate ON public.nanivio_password_recovery(ip_hash,created_at);
CREATE INDEX nanivio_password_recovery_subject ON public.nanivio_password_recovery(subject_hash,created_at);
CREATE INDEX nanivio_password_recovery_owner ON public.nanivio_password_recovery(user_id);
CREATE TABLE public.nanivio_password_epochs (
  user_id text PRIMARY KEY REFERENCES public.nanivio_users(id),
  not_before bigint NOT NULL CHECK (not_before>0)
);
ALTER TABLE public.nanivio_password_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_password_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_password_recovery,public.nanivio_password_epochs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nanivio_password_recovery,public.nanivio_password_epochs TO service_role;

CREATE FUNCTION public.nanivio_reserve_password_recovery(
  p_id text,p_owner text,p_ip_hash text,p_expires timestamptz,p_subject_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_ip_hash !~ '^[a-f0-9]{64}$' OR p_subject_hash !~ '^[a-f0-9]{64}$' OR p_expires<=clock_timestamp()
    OR p_expires>clock_timestamp()+interval '16 minutes' THEN RAISE EXCEPTION 'Invalid recovery reservation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('password-recovery:'||p_ip_hash));
  PERFORM pg_advisory_xact_lock(hashtext('password-subject:'||p_subject_hash));
  DELETE FROM nanivio_password_recovery WHERE expires_at<clock_timestamp()-interval '1 day';
  IF (SELECT count(*) FROM nanivio_password_recovery WHERE purpose='pkce'
      AND ip_hash=p_ip_hash AND created_at>clock_timestamp()-interval '15 minutes')>=10
    OR (SELECT count(*) FROM nanivio_password_recovery WHERE purpose='pkce'
      AND subject_hash=p_subject_hash AND created_at>clock_timestamp()-interval '15 minutes')>=3
    THEN RETURN false; END IF;
  INSERT INTO nanivio_password_recovery(id,user_id,purpose,ip_hash,subject_hash,expires_at)
    VALUES(p_id,p_owner,'pkce',p_ip_hash,p_subject_hash,p_expires);
  RETURN true;
END $$;
CREATE FUNCTION public.nanivio_consume_password_recovery(p_id text,p_purpose text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner text;
BEGIN
  IF p_purpose NOT IN ('pkce','reset') THEN RETURN NULL; END IF;
  UPDATE nanivio_password_recovery SET consumed_at=clock_timestamp()
    WHERE id=p_id AND purpose=p_purpose AND consumed_at IS NULL AND expires_at>clock_timestamp()
    RETURNING user_id INTO owner;
  IF owner IS NULL THEN RETURN NULL; END IF;
  IF p_purpose='reset' THEN
    PERFORM 1 FROM nanivio_users WHERE id=owner AND status='ACTIVE' FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- Fence all earlier app/native JWTs before the uncertain external update.
    INSERT INTO nanivio_password_epochs(user_id,not_before)
      VALUES(owner,floor(extract(epoch FROM clock_timestamp()))::bigint)
      ON CONFLICT(user_id) DO UPDATE SET not_before=greatest(nanivio_password_epochs.not_before,EXCLUDED.not_before);
  END IF;
  RETURN owner;
END $$;
REVOKE ALL ON FUNCTION public.nanivio_reserve_password_recovery(text,text,text,timestamptz,text),
  public.nanivio_consume_password_recovery(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_reserve_password_recovery(text,text,text,timestamptz,text),
  public.nanivio_consume_password_recovery(text,text) TO service_role;

-- Integrate owner-private recovery metadata without weakening the existing
-- local-erasure inventory, lease, stage, retention or verification checks.
ALTER FUNCTION public.nanivio_deletion_clean_local(uuid,uuid,boolean)
  RENAME TO nanivio_deletion_clean_local_before_recovery;
CREATE FUNCTION public.nanivio_deletion_clean_local(
  p_request uuid,p_token uuid,p_verify_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j nanivio_deletion_jobs%ROWTYPE;
BEGIN
  SELECT * INTO j FROM nanivio_deletion_jobs WHERE request_id=p_request FOR UPDATE;
  IF NOT FOUND OR j.state<>'processing' OR j.lease_token IS DISTINCT FROM p_token
    OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Deletion lease lost'; END IF;
  PERFORM 1 FROM nanivio_users WHERE id=j.owner_id AND status='DEACTIVATED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account must be frozen'; END IF;
  IF NOT p_verify_only THEN
    IF (SELECT count(*) FROM nanivio_deletion_steps WHERE request_id=p_request
      AND step IN ('access','billing','storage','voice','stream') AND state='verified')<>5
      OR NOT EXISTS(SELECT 1 FROM nanivio_deletion_steps WHERE request_id=p_request
        AND step='personal_data' AND state='started') THEN RAISE EXCEPTION 'Prerequisite cleanup unverified'; END IF;
    DELETE FROM nanivio_password_recovery WHERE user_id=j.owner_id;
    DELETE FROM nanivio_password_epochs WHERE user_id=j.owner_id;
  ELSIF EXISTS(SELECT 1 FROM nanivio_password_recovery WHERE user_id=j.owner_id)
    OR EXISTS(SELECT 1 FROM nanivio_password_epochs WHERE user_id=j.owner_id)
    THEN RAISE EXCEPTION 'Recovery metadata remains'; END IF;
  -- A failure here rolls back the supplemental deletes in this same transaction.
  RETURN nanivio_deletion_clean_local_before_recovery(p_request,p_token,p_verify_only);
END $$;
REVOKE ALL ON FUNCTION public.nanivio_deletion_clean_local(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_deletion_clean_local(uuid,uuid,boolean) TO service_role;
COMMIT;
SELECT to_regclass('public.nanivio_password_recovery') IS NOT NULL
  AND to_regclass('public.nanivio_password_epochs') IS NOT NULL AS password_recovery_installed;
