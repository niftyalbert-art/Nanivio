-- Apply in the existing Supabase project. No public/client access: the
-- authenticated Nanivio server supplies the verified account ID.
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_memory_preferences (
  user_id TEXT PRIMARY KEY REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  generation BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nanivio_malvi_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.nanivio_users(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL,
  event_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id,generation,event_key)
);
CREATE INDEX IF NOT EXISTS nanivio_malvi_messages_owner_time
  ON public.nanivio_malvi_messages(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS nanivio_malvi_messages_search
  ON public.nanivio_malvi_messages USING gin(to_tsvector('simple',text));
ALTER TABLE public.nanivio_malvi_memory_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nanivio_malvi_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nanivio_malvi_memory_preferences, public.nanivio_malvi_messages FROM anon, authenticated;
GRANT ALL ON public.nanivio_malvi_memory_preferences, public.nanivio_malvi_messages TO service_role;

-- Revocation and deletion lock the same row as appends. A generation token
-- stops delayed requests from re-saving content after disable/delete/re-enable.
CREATE OR REPLACE FUNCTION public.nanivio_set_malvi_memory(p_user TEXT,p_enabled BOOLEAN,p_delete BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE pref nanivio_malvi_memory_preferences;
BEGIN
  INSERT INTO nanivio_malvi_memory_preferences(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  SELECT * INTO pref FROM nanivio_malvi_memory_preferences WHERE user_id=p_user FOR UPDATE;
  UPDATE nanivio_malvi_memory_preferences SET enabled=p_enabled AND NOT p_delete,
    generation=generation+1,updated_at=now() WHERE user_id=p_user RETURNING * INTO pref;
  IF p_delete THEN DELETE FROM nanivio_malvi_messages WHERE user_id=p_user; END IF;
  RETURN jsonb_build_object('enabled',pref.enabled,'generation',pref.generation);
END $$;
CREATE OR REPLACE FUNCTION public.nanivio_append_malvi_memory(p_user TEXT,p_generation BIGINT,p_events JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE pref nanivio_malvi_memory_preferences;
BEGIN
  SELECT * INTO pref FROM nanivio_malvi_memory_preferences WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND OR NOT pref.enabled OR pref.generation<>p_generation THEN RETURN false; END IF;
  IF jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>2 THEN
    RAISE EXCEPTION 'Invalid conversation batch';
  END IF;
  INSERT INTO nanivio_malvi_messages(user_id,generation,event_key,role,text)
    SELECT p_user,p_generation,e->>'key',e->>'role',e->>'text' FROM jsonb_array_elements(p_events) e
    ON CONFLICT(user_id,generation,event_key) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.nanivio_set_malvi_memory(TEXT,BOOLEAN,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.nanivio_append_malvi_memory(TEXT,BIGINT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_set_malvi_memory(TEXT,BOOLEAN,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.nanivio_append_malvi_memory(TEXT,BIGINT,JSONB) TO service_role;
