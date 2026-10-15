-- Remove credentials from existing application payloads and prevent future storage.
-- Supabase Auth's passwords/sessions and account records are not changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.nanivio_sanitize_application(value JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key, public.nanivio_sanitize_application(child)), '{}'::jsonb)
      INTO result FROM jsonb_each(value) AS entry(key, child)
     WHERE regexp_replace(lower(key), '[^a-z0-9]', '', 'g')
       !~ '(password|token|secret|credential|authorization|apikey|privatekey)';
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public.nanivio_sanitize_application(child) ORDER BY position), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(child, position);
    RETURN result;
  END IF;
  RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION public.nanivio_application_privacy_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.payload := public.nanivio_sanitize_application(NEW.payload);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS nanivio_application_privacy ON public.nanivio_user_applications;
CREATE TRIGGER nanivio_application_privacy
BEFORE INSERT OR UPDATE OF payload ON public.nanivio_user_applications
FOR EACH ROW EXECUTE FUNCTION public.nanivio_application_privacy_guard();

UPDATE public.nanivio_user_applications
   SET payload = public.nanivio_sanitize_application(payload), updated_at = NOW()
 WHERE payload IS DISTINCT FROM public.nanivio_sanitize_application(payload);

REVOKE ALL ON FUNCTION public.nanivio_sanitize_application(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nanivio_application_privacy_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nanivio_sanitize_application(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.nanivio_application_privacy_guard() TO service_role;
COMMIT;
