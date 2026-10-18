# Infobip signup phone verification

Infobip 2FA is the live signup SMS provider, replacing Prelude. Existing accounts,
Supabase authentication, signup forms and verification-proof requirements are
unchanged. There is no automatic fallback to Prelude. Its retained adapter exists
only for legacy regression coverage and is not selected by application signup.

## Required setup

1. Create an Infobip account at https://portal.infobip.com/signup.
2. Confirm transactional SMS/2FA is enabled for the countries Nanivio serves,
   including UAE (+971). Confirm trial-recipient restrictions, sender registration
   and required account credit with Infobip; coverage must not be assumed.
3. Create an API key with the `2fa:manage` or `2fa:pin:send` permissions required by
   Infobip's send/check APIs. Keep it server-side.
4. Copy the account's HTTPS API base URL (for example, the host shape is
   `https://<account>.api.infobip.com`, not the dashboard URL). Do not append paths.
5. Create and enable a 2FA application. Configure a five-minute PIN lifetime and
   no more than five verification attempts.
6. Create an SMS message template under that application. Configure **six numeric
   digits**, e.g. `Your Nanivio verification code is {{pin}}`. Use an authorized
   sender; this integration uses the template's sender instead of overriding it.
7. Record the application's ID and the SMS message template's ID.

Configure these four backend values in Replit for preview and **separately on the
existing live Render service**:

| Setting | Value |
| --- | --- |
| `INFOBIP_API_KEY` | Raw complete API key; no `App ` prefix or quotes |
| `INFOBIP_API_BASE_URL` | Account API HTTPS origin |
| `INFOBIP_2FA_APPLICATION_ID` | Enabled 2FA application ID |
| `INFOBIP_2FA_MESSAGE_ID` | Six-digit numeric SMS template ID |

The backend adds `Authorization: App <key>`. Never use `VITE_` for any of these
settings. Deploy the code and restart after configuring the values. Missing or
invalid settings fail closed; they never bypass phone verification.

## Runtime behavior

- Sends via `POST /2fa/2/pin?ncNeeded=false`; optional paid Number Lookup is disabled.
- Checks via `POST /2fa/2/pin/{pinId}/verify`.
- Requires `MESSAGE_SENT`, a provider PIN ID, and the expected recipient before
  showing code entry. This means accepted for sending, **not confirmed delivery**.
- Requires a verified response with the matching PIN ID and recipient. A bare
  `verified: true` is insufficient.
- Existing 45-second cooldown, hourly send limits, five-attempt check limit,
  five-minute local verification window and single-use phone-bound proofs remain.
- Infobip may issue a new PIN ID on resend. Old challenges are replaced by the new
  provider challenge; the hourly/cooldown limits continue to apply.
- Technical errors go only to protected admin diagnostics and safe server logs,
  prefixed `[Infobip Verify] Request rejected`. Public signup errors stay generic.
- No API keys, codes, phone numbers or raw provider errors enter diagnostics.

State and diagnostic history are still process-local. Use one replica. A restart
requires a new phone verification. Shared atomic state and persistent diagnostic
history are separate existing follow-up work.

## Verification before live rollout

Run type checks, the production build and the OTP/admin regression tests. Then,
with configured Infobip credentials, request a code to an authorized trial or real
number, receive it and confirm it in Nanivio. No permanent account is required to
check phone verification. Repeat on Render: a successful preview does not prove
that Render has the same configuration. Do not claim delivery works before this
test succeeds.

Official API and setup references:
- https://www.infobip.com/docs/2fa-service
- https://www.infobip.com/docs/2fa-service/general-2fa-otp-setup
- https://www.infobip.com/docs/api/channels/sms/2fa
- https://api.infobip.com/platform/1/openapi/2fa
