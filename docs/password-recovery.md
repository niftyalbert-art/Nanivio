# Nanivio password recovery

## Release status and setup

This implements the public browser recovery flow. It does not change any live
password, send a test email, apply SQL or authorize a push/deployment.

Before the coordinated browser/server release:

1. Install `migrations/033_password_recovery.sql` in the existing production
   Supabase project, after deletion migrations 029–032. Expected final flag:
   `password_recovery_installed = true`. Setup changes no account password,
   status or deletion job. Do not rerun the migration after a successful install.
2. Set the Render `PUBLIC_APP_URL` to `https://naniviio.com` and allow
   `https://naniviio.com/reset-password` in Supabase Authentication URL settings.
   It must be a bare HTTPS origin, without credentials, a query or subdirectory.
   Preview/staging uses its own approved origin and corresponding redirect
   allow-list; a workspace value does not configure Render.
3. Verify Supabase Auth's Reset Password email template uses its generated
   `ConfirmationURL` and that Supabase Auth's SMTP/sender configuration works.
   This delivery path is not the separate Nanivio/Resend signup/deletion sender.
4. Configure `AUTH_TRUSTED_PROXY_CIDRS` for the actual trusted proxy network if
   client-IP accounting is required behind Render. Arbitrary forwarded headers
   are never trusted. Without it, the socket/proxy IP shares a conservative limit.
5. Release the recovery routes, UI, epoch-aware HTTP authentication and realtime
   account authority together. They require the installed tables and fail closed
   on shared-store outages. Never deploy only the reset form/endpoint.

Do not run migration 031 again after 033: 033 wraps its reviewed local-cleanup
function to remove the new recovery metadata within the same checked transaction.
Future deletion migration changes must preserve that wrapper integration.

## User flow

- Forgot Password accepts the registered email, phone number or NV ID.
- Eligible and unknown/inactive accounts receive the same neutral response.
  Provider errors are not exposed as account-existence information.
- The server generates a S256 PKCE verifier. Only the provider challenge and
  approved redirect go to Supabase; the verifier lives in an encrypted,
  purpose/host-bound HttpOnly cookie.
- Open the newest email link in the same browser that requested it. Starting
  another recovery replaces that browser's verifier. Different-browser/device
  links and old implicit access-token fragments are rejected with fresh-link
  guidance; they are never downgraded to arbitrary bearer-token reset.
- The public `/reset-password` page exchanges the code once, removes URL
  credentials and uses a short-lived HttpOnly reset capability. It works outside
  normal sign-in and never signs the user in automatically.
- Passwords must match, contain 8–128 characters and satisfy Supabase's configured
  password policy. The server applies the same length bounds.
- Weak input does not consume the capability; dispatching a valid password does.
  Captured cookies and concurrent requests cannot repeat the update.

## Security and revocation

Only service-role code can reserve/consume the durable grants or read password
epochs. Records contain opaque owner IDs, expiry/consumption state and HMAC rate
keys, never the recovery code/verifier, password or provider bearer token.
Shared IP and identifier limits apply to known and unknown identifiers.

A reset atomically consumes its capability and records a password epoch before
the external update. All earlier Nanivio browser/native JWTs are denied at HTTP
authentication, and existing sockets lose their authority through the shared
account checker. High-frequency media retains the existing bounded short lease;
checks are not performed for every individual PCM frame. Other users and sessions
issued after the epoch remain unaffected.

Supabase receives a user-scoped password update, followed by explicit global
logout to invalidate its refresh sessions. Success is reported only if both
operations are confirmed. A failed/uncertain update or logout leaves the
capability consumed and reports that the password may have changed; request a
fresh recovery link instead of automatically retrying an uncertain update.
These app authority checks are not independent RTC/provider-grant revocation;
already-issued media grants retain their documented provider expiry boundary.

JWT issued-at precision is one second. A new sign-in in the reset's same second
may be refused briefly with retry guidance, rather than accepting older tokens.
Changing only profile settings does not advance this epoch.

Live recovery attempts can update shared rate-limit and expiry metadata.
Expired capability rows are removed on subsequent reservations after one day;
epochs remain until the owner is erased. The deletion worker removes only the
named owner's recovery grants/epoch after its existing lease, freeze and stage
checks, in the same transaction as local cleanup. It does not alter A/B or
retained financial evidence.

## Verification boundary

Automated tests use isolated HTTP/provider fixtures and PGlite only. They cover
successful recovery, validation, generic responses, origin and owner binding,
replay/concurrency, expiry, provider uncertainty, epoch revocation, grant SQL,
rate limits and integration with the existing deletion worker.

No real reset email or password change is included in that verification.
After setup/release, obtain separate approval for one disposable-account live
test, confirm delivery and link return, change only that account's password and
verify fresh sign-in plus rejection of its old session. Native Android deep links
and recovery inside an app WebView need their own integration/physical-device test.
