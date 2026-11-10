-- Request intake only. This migration NEVER deletes or deactivates an account.
-- Apply through the existing Supabase SQL editor; not a database replacement.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nanivio_deletion_limits (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL
);
CREATE TABLE IF NOT EXISTS public.nanivio_deletion_challenges (
  id uuid PRIMARY KEY, owner_id text NOT NULL,
  code_hash text NOT NULL, sent boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.nanivio_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','processing','needs_attention','completed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
ALTER TABLE public.nanivio_deletion_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_deletion_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_deletion_limits, public.nanivio_deletion_challenges,
  public.nanivio_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nanivio_deletion_limits,
  public.nanivio_deletion_challenges, public.nanivio_deletion_requests TO service_role;
CREATE INDEX IF NOT EXISTS nanivio_deletion_pending
  ON public.nanivio_deletion_requests(status,requested_at);

CREATE OR REPLACE FUNCTION public.nanivio_reserve_deletion_challenge(
  p_email text, p_email_hash text, p_ip_hash text, p_id uuid, p_code_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; n integer; cap integer; period interval; uid text;
BEGIN
  -- Fixed lock order across instances; limits apply to unknown emails too.
  PERFORM pg_advisory_xact_lock(hashtextextended('deletion-ip:'||p_ip_hash,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('deletion-email:'||p_email_hash,0));
  FOREACH k IN ARRAY ARRAY['ip:'||p_ip_hash,'email:'||p_email_hash,'cooldown:'||p_email_hash] LOOP
    cap := CASE WHEN k LIKE 'ip:%' THEN 20 WHEN k LIKE 'email:%' THEN 5 ELSE 1 END;
    period := CASE WHEN k LIKE 'cooldown:%' THEN interval '60 seconds' ELSE interval '1 hour' END;
    INSERT INTO nanivio_deletion_limits(key,window_start,count) VALUES(k,now(),1)
      ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN nanivio_deletion_limits.window_start<=now()-period
          THEN 1 ELSE nanivio_deletion_limits.count+1 END,
        window_start=CASE WHEN nanivio_deletion_limits.window_start<=now()-period
          THEN now() ELSE nanivio_deletion_limits.window_start END
      RETURNING count INTO n;
    IF n>cap THEN RETURN jsonb_build_object('allowed',false); END IF;
  END LOOP;
  DELETE FROM nanivio_deletion_challenges WHERE expires_at<now()-interval '1 day';
  SELECT id INTO uid FROM nanivio_users WHERE lower(trim(email))=p_email
    AND coalesce(status,'ACTIVE') IN ('ACTIVE','DEACTIVATED','SUSPENDED') LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO nanivio_deletion_challenges(id,owner_id,code_hash,expires_at)
      VALUES(p_id,uid,p_code_hash,now()+interval '10 minutes');
  END IF;
  -- This result is server-only. The public response never exposes `known`.
  RETURN jsonb_build_object('allowed',true,'known',uid IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_mark_deletion_email_sent(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE nanivio_deletion_challenges SET sent=true WHERE id=p_id AND consumed=false;
$$;

CREATE OR REPLACE FUNCTION public.nanivio_confirm_deletion_request(p_id uuid,p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE challenge nanivio_deletion_challenges%ROWTYPE; item nanivio_deletion_requests%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM nanivio_deletion_challenges WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT challenge.sent OR challenge.expires_at<=now() OR challenge.attempts>=5
    THEN RETURN jsonb_build_object('verified',false); END IF;
  IF challenge.code_hash<>p_code_hash THEN
    -- Return rather than raise: failed-attempt increments must commit.
    UPDATE nanivio_deletion_challenges SET attempts=attempts+1 WHERE id=p_id;
    RETURN jsonb_build_object('verified',false);
  END IF;
  INSERT INTO nanivio_deletion_requests(owner_id) VALUES(challenge.owner_id)
    ON CONFLICT(owner_id) DO NOTHING;
  SELECT * INTO item FROM nanivio_deletion_requests WHERE owner_id=challenge.owner_id;
  UPDATE nanivio_deletion_challenges SET consumed=true WHERE id=p_id;
  RETURN jsonb_build_object('verified',true,'request',jsonb_build_object(
    'id',item.id,'status',item.status,'requestedAt',item.requested_at));
END $$;

REVOKE ALL ON FUNCTION public.nanivio_reserve_deletion_challenge(text,text,text,uuid,text),
  public.nanivio_mark_deletion_email_sent(uuid),
  public.nanivio_confirm_deletion_request(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_reserve_deletion_challenge(text,text,text,uuid,text),
  public.nanivio_mark_deletion_email_sent(uuid),
  public.nanivio_confirm_deletion_request(uuid,text) TO service_role;
COMMIT;
SELECT true AS account_deletion_requests_installed;
