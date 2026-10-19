-- Run in the existing Supabase project's SQL editor before enabling email signup.
-- No accounts are deleted. Existing identity conflicts make index creation fail.
BEGIN;

CREATE OR REPLACE FUNCTION public.nanivio_phone_identity(p_phone text, p_calling_code text DEFAULT '')
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        c text := regexp_replace(coalesce(p_calling_code,''), '[^0-9]', '', 'g');
BEGIN
  IF d = '' THEN RETURN ''; END IF;
  IF left(trim(p_phone),1) = '+' THEN RETURN d; END IF;
  IF left(d,2) = '00' THEN RETURN substr(d,3); END IF;
  IF c = '' OR (left(d,length(c)) = c AND length(d) > 9) THEN RETURN d; END IF;
  RETURN c || ltrim(d,'0');
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS nanivio_users_signup_email_unique
  ON public.nanivio_users (lower(trim(email))) WHERE trim(coalesce(email,'')) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS nanivio_users_signup_phone_unique
  ON public.nanivio_users (public.nanivio_phone_identity(phone, calling_code))
  WHERE trim(coalesce(phone,'')) <> '';

ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE public.nanivio_users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.nanivio_signup_email_challenges (
  email text PRIMARY KEY, phone text NOT NULL, id uuid NOT NULL,
  code_hash text NOT NULL, sent boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL, last_sent_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  proof_hash text, verified_until timestamptz, consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.nanivio_signup_email_limits (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL
);
ALTER TABLE public.nanivio_signup_email_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_signup_email_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_signup_email_challenges, public.nanivio_signup_email_limits FROM anon, authenticated;
GRANT ALL ON public.nanivio_signup_email_challenges, public.nanivio_signup_email_limits TO service_role;

CREATE OR REPLACE FUNCTION public.nanivio_signup_identity_available(p_email text, p_phone text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM nanivio_users WHERE lower(trim(email)) = lower(trim(p_email))
      OR nanivio_phone_identity(phone,calling_code) = nanivio_phone_identity(p_phone)
  );
$$;

CREATE OR REPLACE FUNCTION public.nanivio_reserve_signup_email(
  p_email text, p_phone text, p_ip_hash text, p_id uuid, p_code_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; n integer; cap integer; last_send timestamptz;
BEGIN
  -- Serialize sends for an email across processes, including the first send.
  PERFORM pg_advisory_xact_lock(hashtextextended('signup-email:' || p_email,0));
  SELECT last_sent_at INTO last_send FROM nanivio_signup_email_challenges WHERE email=p_email;
  IF last_send > now() - interval '60 seconds' THEN RETURN 'cooldown'; END IF;
  FOREACH k IN ARRAY ARRAY['email:' || p_email, 'phone:' || p_phone, 'ip:' || p_ip_hash] LOOP
    cap := CASE WHEN k LIKE 'ip:%' THEN 20 ELSE 5 END;
    INSERT INTO nanivio_signup_email_limits(key,window_start,count) VALUES(k,now(),1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN nanivio_signup_email_limits.window_start <= now()-interval '1 hour'
          THEN 1 ELSE nanivio_signup_email_limits.count+1 END,
        window_start = CASE WHEN nanivio_signup_email_limits.window_start <= now()-interval '1 hour'
          THEN now() ELSE nanivio_signup_email_limits.window_start END
      RETURNING count INTO n;
    IF n > cap THEN RETURN 'limited'; END IF;
  END LOOP;
  INSERT INTO nanivio_signup_email_challenges(email,phone,id,code_hash,expires_at,last_sent_at)
    VALUES(p_email,p_phone,p_id,p_code_hash,now()+interval '10 minutes',now())
    ON CONFLICT(email) DO UPDATE SET phone=excluded.phone,id=excluded.id,code_hash=excluded.code_hash,
      sent=false,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,
      attempts=0,proof_hash=NULL,verified_until=NULL,consumed=false;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_verify_signup_email(
  p_email text, p_phone text, p_code_hash text, p_proof_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c nanivio_signup_email_challenges%ROWTYPE;
BEGIN
  SELECT * INTO c FROM nanivio_signup_email_challenges WHERE email=p_email FOR UPDATE;
  IF NOT FOUND OR NOT c.sent OR c.phone<>p_phone OR c.expires_at<=now()
    OR c.attempts>=5 OR c.proof_hash IS NOT NULL OR c.consumed THEN RETURN 'invalid'; END IF;
  UPDATE nanivio_signup_email_challenges SET attempts=attempts+1 WHERE email=p_email;
  IF c.code_hash<>p_code_hash THEN RETURN 'invalid'; END IF;
  UPDATE nanivio_signup_email_challenges SET proof_hash=p_proof_hash,
    verified_until=now()+interval '15 minutes' WHERE email=p_email;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.nanivio_consume_signup_email(
  p_email text, p_phone text, p_proof_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE used text;
BEGIN
  UPDATE nanivio_signup_email_challenges SET consumed=true
    WHERE email=p_email AND phone=p_phone AND proof_hash=p_proof_hash
      AND verified_until>now() AND NOT consumed RETURNING email INTO used;
  RETURN used IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.nanivio_signup_identity_available(text,text),
  public.nanivio_reserve_signup_email(text,text,text,uuid,text),
  public.nanivio_verify_signup_email(text,text,text,text),
  public.nanivio_consume_signup_email(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_signup_identity_available(text,text),
  public.nanivio_reserve_signup_email(text,text,text,uuid,text),
  public.nanivio_verify_signup_email(text,text,text,text),
  public.nanivio_consume_signup_email(text,text,text) TO service_role;
COMMIT;
