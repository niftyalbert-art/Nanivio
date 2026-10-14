-- The runner seeds a legacy record before applying migration 008.
BEGIN;
DO $$
DECLARE
  row_payload JSONB;
BEGIN
  SELECT payload INTO row_payload FROM nanivio_user_applications
   WHERE id = '00000000-0000-0000-0000-000000000001';
  IF row_payload #> '{personal,password}' IS NOT NULL
     OR row_payload #> '{nested,0,refresh_token}' IS NOT NULL
     OR row_payload #>> '{personal,firstName}' <> 'Test' THEN
    RAISE EXCEPTION 'Legacy application cleanup failed';
  END IF;
  UPDATE nanivio_user_applications
     SET payload = payload || '{"password":"test-only","nested":[{"clientSecret":"test-only","safe":true}]}'::jsonb
   WHERE id = '00000000-0000-0000-0000-000000000001';
  SELECT payload INTO row_payload FROM nanivio_user_applications
   WHERE id = '00000000-0000-0000-0000-000000000001';
  IF row_payload ? 'password' OR row_payload #> '{nested,0,clientSecret}' IS NOT NULL
     OR row_payload #>> '{nested,0,safe}' <> 'true' THEN
    RAISE EXCEPTION 'Application update guard failed';
  END IF;
  INSERT INTO nanivio_user_applications(id,user_id,application_type,status,payload)
  VALUES('00000000-0000-0000-0000-000000000002','privacy-test','DRIVER','PENDING',
    '{"personal":{"password":"test-only","firstName":"Driver"},"credentials":{"token":"test-only"}}');
  SELECT payload INTO row_payload FROM nanivio_user_applications
   WHERE id = '00000000-0000-0000-0000-000000000002';
  IF row_payload #> '{personal,password}' IS NOT NULL OR row_payload ? 'credentials' THEN
    RAISE EXCEPTION 'Application insert guard failed';
  END IF;
  RAISE NOTICE 'Legacy cleanup and application privacy guard checks passed';
END;
$$;
ROLLBACK;
