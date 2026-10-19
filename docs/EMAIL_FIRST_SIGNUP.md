# Nanivio email-first signup

## Product rules

- Personal, expert, business and driver signup collect both email and international phone.
- Email is verified using a six-digit email code. No signup SMS is sent.
- An email address or phone identity cannot belong to two accounts, across all roles.
- The phone is collected, not ownership-verified. Do not treat it as proof for phone-based
  account recovery or phone-number discovery.
- City, constituency and district/municipality are not requested or fabricated at signup.
- Existing users retain their accounts and password-based sign-in.
- Malvi brain and avatar behavior are outside this update.

## Before enabling on Render

1. Back up the existing Supabase database.
2. Review and run `migrations/010_email_first_signup.sql` in that project's SQL editor.
   This is an additive migration, not a database replacement. It does not delete accounts.
   If existing email/phone duplicates cause index creation to fail, the transaction rolls
   back: resolve the conflicts with the account owners instead of deleting rows blindly.
3. Configure Resend with a verified sending domain. Supply the server-only
   `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (for example, `Nanivio <verify@your-domain>`).
   The from address must be authorized by Resend; no invented fallback sender is used.
   Configure the production Render service separately from the development workspace.
   On Render use `RESEND_TRANSPORT=direct` (the default).
   This Replit workspace can instead use `RESEND_TRANSPORT=connector` with the attached
   Resend connection and `RESEND_FROM_EMAIL=Nanivio <verify@naniviio.com>`; the connector
   injects credentials server-side. Do not copy Replit identity tokens to Render.
   Each request selects exactly one transport; errors never trigger cross-transport retries.
4. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and
   `SESSION_SECRET` configured. Use the same session secret across server instances.
   No credentials belong in Vite/client variables.
5. Deploy the reviewed changes from `malvi-production-upgrade` only.
6. Test using an inbox you control: send, receive, verify, register, then sign out/in.
   Confirm duplicate email and differently-formatted duplicate phone are rejected.
   Confirm `/api/auth/phone/otp/send` returns 410 and does not contact Didit.

The code does not automatically apply a migration to the external production database.
Without email credentials or the migration, signup fails explicitly; no code is simulated
or accepted without delivery. Existing sign-in is independent of the email sending service.

## Security and delivery

- Ten-minute codes, five verification attempts, 60-second resend cooldown.
- Five sends per email and phone per rolling one-hour counter window; 20 per IP window.
- Shared PostgreSQL state and row/advisory locks enforce limits across processes/restarts.
- Stored code hashes use HMAC; raw codes are not stored in the database or logged.
- Email verification creates a random 15-minute proof bound to both email and phone.
- Registration atomically consumes the proof once; changing either identity invalidates it.
- Failed delivery never marks a challenge as sent. Resending invalidates previous codes
  and proofs. Failed registration may require requesting and verifying a new code.
- Email is lowercased/trimmed. Provider-specific aliases such as plus tags are not collapsed.
- International phone normalization uses libphonenumber; database uniqueness also
  recognizes formatted legacy international/national values using their stored calling code.
- Challenge and rate-limit tables/RPCs are server-only with RLS and revoked public access.
- No raw provider body, email address, phone number, code, token, or credential is logged.

## Verification

`node --import tsx --test tests/email-signup.test.ts` executes the actual migration and
security/concurrency cases in isolated, in-memory PostgreSQL (PGlite). No production
account, paid SMS, or real email is created by this test suite.
