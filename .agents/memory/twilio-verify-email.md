---
name: Twilio Verify email OTP
description: How email verification via Twilio Verify is wired into the auth flow, including the dev-mode fallback and schema decisions.
---

# Twilio Verify Email OTP

## Connector
- Connection ID: `conn_twilio_01KYXPKFKQM0S1EEN1C31QF866`
- Proxy paths: `/v2/Services/{SID}/Verifications` (send) and `/v2/Services/{SID}/VerificationChecks` (check)
- Twilio Verify API lives at `verify.twilio.com`, but the connector's base URL handling is unknown — if it fails, the helper falls back gracefully to dev mode.

## Required env var
`TWILIO_VERIFY_SERVICE_SID` — admin creates a Verify Service in the Twilio console and sets this. Without it the system runs in dev mode (code logged to server console, never emailed).

## Dev-mode fallback
`sendVerificationCode()` in `artifacts/api-server/src/lib/twilio-verify.ts` returns `{ sent: false, fallbackCode }` when not configured. The route stores the fallback code in `email_verification_code` and `email_verification_expires_at` on the user row. `checkVerificationCode()` checks DB when Twilio SID not set.

## Schema decision
`email_verified BOOLEAN NOT NULL DEFAULT TRUE` in the SQL migration — existing users stay verified (not locked out). Drizzle schema uses `.default(false)` so new inserts default to unverified. Signup always passes `emailVerified: false` explicitly.

**Why:** Existing users must not be required to re-verify. New signups must verify before logging in.

## Auth flow
- Signup returns `{ requiresVerification: true, email }` — no JWT token until verified
- Login returns 403 `{ error: "EMAIL_NOT_VERIFIED", email }` for unverified accounts (also silently resends a fresh code)
- `POST /auth/verify-email` — checks code, marks verified, returns JWT
- `POST /auth/resend-verification` — rate-limited to once per 60 seconds
- Frontend stores email in `sessionStorage("pendingVerifyEmail")` to survive reloads

## Reuse opportunity
`sendVerificationCode()` can be called from the forgot-password handler to deliver real reset-code emails — just pass the email and channel="email".
