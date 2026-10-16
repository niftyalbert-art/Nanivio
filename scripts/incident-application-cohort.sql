-- OWNER-RUN ONLY: confirm the live Supabase project before running.
-- No payload, credential value, email, user ID or token is returned.
-- This is assessment, NOT migration or account remediation.
-- Requires owner/read-only access to public tables and auth.users/auth.sessions.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

WITH RECURSIVE nodes AS (
  SELECT id, payload AS value, false AS password_key, false AS sensitive_key
  FROM public.nanivio_user_applications
  UNION ALL
  SELECT n.id, child.value,
    regexp_replace(lower(child.key), '[^a-z0-9]', '', 'g') ~ 'password',
    regexp_replace(lower(child.key), '[^a-z0-9]', '', 'g')
      ~ '(password|token|secret|credential|authorization|apikey|privatekey)'
  FROM nodes n
  CROSS JOIN LATERAL (
    SELECT key, value FROM jsonb_each(
      CASE WHEN jsonb_typeof(n.value) = 'object' THEN n.value ELSE '{}'::jsonb END
    )
    UNION ALL
    SELECT '', value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(n.value) = 'array' THEN n.value ELSE '[]'::jsonb END
    )
  ) child
), flags AS (
  SELECT id,
    bool_or(password_key) AS has_password_key,
    bool_or(password_key AND value NOT IN ('null'::jsonb, '""'::jsonb))
      AS has_nonempty_password_field,
    bool_or(sensitive_key) AS has_sensitive_key
  FROM nodes GROUP BY id
), assessed AS (
  SELECT a.application_type, a.user_id, a.created_at, f.*,
    u.auth_user_id, au.id AS matched_auth_id
  FROM public.nanivio_user_applications a
  JOIN flags f ON f.id = a.id
  LEFT JOIN public.nanivio_users u ON u.id = a.user_id
  LEFT JOIN auth.users au ON au.id = u.auth_user_id
)
SELECT CASE WHEN GROUPING(application_type) = 1 THEN 'ALL' ELSE application_type END AS cohort,
  count(*) AS application_rows,
  count(DISTINCT user_id) AS applicant_accounts,
  count(*) FILTER (WHERE has_password_key) AS rows_with_password_keys,
  count(*) FILTER (WHERE has_nonempty_password_field) AS rows_with_nonempty_password_fields,
  count(DISTINCT user_id) FILTER (WHERE has_nonempty_password_field)
    AS candidate_password_accounts,
  count(*) FILTER (WHERE has_sensitive_key) AS rows_with_any_sensitive_key,
  count(DISTINCT user_id) FILTER (WHERE has_sensitive_key) AS candidate_sensitive_accounts,
  count(DISTINCT matched_auth_id) FILTER (WHERE has_nonempty_password_field)
    AS password_accounts_matched_to_auth,
  count(DISTINCT user_id) FILTER (
    WHERE has_nonempty_password_field AND matched_auth_id IS NULL
  ) AS password_accounts_without_auth_match,
  count(DISTINCT matched_auth_id) FILTER (
    WHERE has_nonempty_password_field AND EXISTS (
      SELECT 1 FROM auth.sessions s WHERE s.user_id = assessed.matched_auth_id
    )
  ) AS password_accounts_with_stored_sessions,
  min(created_at) FILTER (WHERE has_nonempty_password_field) AS earliest_candidate_application,
  max(created_at) FILTER (WHERE has_nonempty_password_field) AS latest_candidate_application
FROM assessed
GROUP BY GROUPING SETS ((application_type), ())
ORDER BY cohort;

-- Installation evidence only; does not prove the live app deployed the fix.
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.nanivio_user_applications'::regclass
      AND tgname = 'nanivio_application_privacy'
      AND NOT tgisinternal AND tgenabled IN ('O', 'A')
  ) AS cleanup_guard_enabled,
  to_regprocedure('public.nanivio_sanitize_application(jsonb)') IS NOT NULL
    AS sanitizer_installed;
COMMIT;
