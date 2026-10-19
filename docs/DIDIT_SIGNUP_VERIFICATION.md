# Didit signup phone verification

Application signup selects Didit only. There is no automatic fallback to Prelude
or Infobip and no bypass when provider configuration or delivery fails. Existing
Supabase accounts, signin, signup forms and password recovery are unchanged.
This does not implement Resend.

## Configuration

Create a named key for the correct Live application at https://business.didit.me/.
Use Custom access with **Sessions write only**, all workflows and every session
status (no workflow or approved-only restriction). Media, decisions, API key
management and other resource access are not required. Confirm destination
coverage, trial restrictions and account credit with Didit before live traffic.

Store the complete raw key as server secret `DIDIT_API_KEY`, without quotes,
whitespace or an authentication prefix. Never use a `VITE_` key. Do not put it in
source code, screenshots or logs. Replit preview and the live Render service have
separate environments: configure Render separately when deploying approved code.
Save/redeploy the Render service to pick up a new environment value.

The key created during setup expires January 17, 2027. Replace it before expiry.
For future rotation, Didit documents a 24-hour overlap for the prior secret;
update every environment and verify before the overlap ends.

No workflow ID, application ID, sender phone number or client SDK key is needed.
The backend uses `x-api-key` on the fixed Didit HTTPS endpoint; redirects fail closed.

## Send and check contract

- `POST https://verification.didit.me/v3/phone/send/`: E.164 phone number,
  `preferred_channel: sms`, `code_size: 6`, and `sms_sender_name: Nanivio`.
  The brand name is message content, not a guarantee of a particular sender ID.
- Only `Success`/`Retry` with a valid session UUID create a local pending challenge.
  HTTP 200 with `Blocked` does not.
- `POST https://verification.didit.me/v3/phone/check/`: same E.164 number and code.
  Only `Approved` with the original session ID and matching approved phone report
  issues a Nanivio proof. HTTP 200 alone never proves ownership.
- Failed/expired checks may return unrelated UUIDs; they are treated as wrong or
  expired codes, never as approval. Social-footprint lookup is explicitly disabled.
- Keep the 45-second send cooldown, six sends per phone/hour, 120 per IP/hour and
  five-minute challenge. Didit's three-check attempt limit applies locally too.
  Same-session resends do not reset local attempts or expiry.
- Proofs expire after 15 minutes, are phone-bound and consumed once during signup
  across personal, expert, business and driver flows.

Pending challenges, proofs, limits and the bounded diagnostics feed are still
process-local. Restart requires fresh verification. Shared atomic state is
required before running multiple replicas; this limitation predates this adapter.

## Diagnostics and testing

Users see a generic retry error for provider failures. Protected admin diagnostics
and server logs show only static Didit explanations, HTTP status, safe codes and
validated UUID correlation IDs. Never include raw responses: a Didit phone report
can contain phone numbers, personal data and attempted OTPs.

- 401: incorrect, revoked or expired key.
- 403: access scope or IP restrictions; standalone APIs need Sessions write with
  no workflow/status restrictions.
- 402: account credit required.
- 429: provider rate limit.
- 5xx/network error: temporary provider/connection failure.

Mocked regression tests exercise success, blocked/declined/incorrect/expired
outcomes, mismatches, missing credentials, HTTP/network errors, resends, limits,
single-use proofs and protected admin rendering.

Real delivery is a separate acceptance check: use an authorized recipient, request
one SMS, enter the code in the signup UI and check the Didit console. Do not create
an account or send repeated paid SMS solely to check that a key exists. A passing
mock test or an accepted API request does not establish real UAE delivery.

Official references:
- https://docs.didit.me/standalone-apis/phone-send
- https://docs.didit.me/standalone-apis/phone-check
- https://docs.didit.me/console/api-keys
- https://docs.didit.me/getting-started/phone-verification-pricing
