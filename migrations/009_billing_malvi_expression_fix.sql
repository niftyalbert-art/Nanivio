-- Preserve the deployed billing RPC and its grants, correcting only the Malvi
-- fallback plan-id expression. Without parentheses PostgreSQL concatenates
-- text with the JSON payload before evaluating ->>, causing JSON parse errors.
DO $migration$
DECLARE
  function_id REGPROCEDURE := to_regprocedure('public.nanivio_billing_command(text,jsonb)');
  definition TEXT;
BEGIN
  IF function_id IS NULL THEN
    RAISE EXCEPTION 'Apply billing migration 002 before migration 009';
  END IF;
  definition := pg_get_functiondef(function_id);
  definition := regexp_replace(
    definition,
    $pattern$'malvi_'\s*\|\|\s*payload\s*->>\s*'tier'$pattern$,
    $replacement$'malvi_' || (payload->>'tier')$replacement$,
    'g'
  );
  EXECUTE definition;
END;
$migration$;
