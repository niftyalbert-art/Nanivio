# Prelude signup phone verification

> Retired from live signup. See [Infobip signup verification](INFOBIP_SIGNUP_VERIFICATION.md)
> for the current provider and environment requirements. The instructions below
> describe the retained legacy adapter, not the active application setup.

## Scope

Prelude Verify replaces Twilio Verify for signup phone ownership checks.
Existing Supabase authentication remains in place. This change does not connect
Resend or alter password recovery, billing, calling or Malvi.

All personal, expert, business and driver registration endpoints require a
phone-bound, single-use verification proof. The signup UI exposes code entry for
personal, expert, standard business and Nanivio Drive enrollment.

## Configuration

1. Create a **v2 API key** under **Settings → API Keys** in the Prelude dashboard.
2. Store it as server-side `PRELUDE_API_KEY` in Replit Secrets for development.
3. Separately add `PRELUDE_API_KEY` to the existing Render service's environment
   before publishing this code there. Git does not transfer secrets.
4. Confirm production access, destination coverage, account balance and sending
   limits in Prelude. Default templates avoid requiring a custom sender at launch.
5. Restart the relevant service after changing its environment.

The key must never appear in browser code, a `VITE_` variable, source control,
API responses or logs. Twilio credentials are no longer used by signup OTP;
legacy telecom features, if used, are separate.

## Delivery and testing

The server uses `https://api.prelude.dev/v2/verification` and
`/verification/check`, with Bearer authentication. It requests six-digit message
verification and prefers SMS. The UI reports the channel returned by Prelude.

Prelude may use other messaging channels enabled on the account when SMS routes
are unavailable. To require SMS exclusively, confirm dashboard routing with
Prelude. Its API's strict `channels` option requires separate enablement; do not
assume it is available on a newly registered account.

A successful send response means a request was accepted, **not** that a handset
received it. Only a successful check for the matching provider verification ID
can issue a signup proof.

Signup users see only: “We couldn't verify your phone right now. Please try
again later.” Technical provider details are not included in public OTP errors.
Administrators can open **Admin → Audit Logs & Security → Phone verification
diagnostics** to refresh the recent provider failures. The server-protected
`GET /api/admin/phone-verification/diagnostics` endpoint requires existing admin
authorization and returns `Cache-Control: private, no-store`.

The protected dashboard and Render logs include a timestamp, send/check step,
HTTP status, allowlisted provider code, safe explanation and, when supplied,
a validated UUID request ID for provider support. Missing configuration, network
failures, malformed responses and blocked sends are recorded too.
The app never forwards the provider's free-text error message, phone,
credentials, verification code or request body. Unknown/non-JSON HTTP failures
retain the HTTP status with `unknown_error`. An absent verification record or a
zero balance alone does not identify the rejection reason.

The dashboard stores at most 100 events from the last 24 hours **in this server
process only**. It clears on restart and is not a durable audit ledger or a
cross-instance history. Empty history is not evidence of successful delivery.

For `invalid_api_key`/`invalid_bearer_token`, check the v2 key for the matching
Prelude app in Render and redeploy. For `insufficient_balance` during a sandbox
test, check the exact number is registered as sandboxed in that same app before
assuming a top-up is necessary. Review Routes for region/channel restrictions.
Configuration/unknown errors need investigation rather than repeated send clicks.

Automated tests inject provider responses and never send real SMS:

```sh
node --import tsx --test tests/prelude-verification.test.ts
node --import tsx --test tests/prelude-errors.test.ts tests/phone-verification-admin.test.ts
npm run lint
npm run build
npm run test:dependencies
```

Before production, use a Prelude dashboard test number for a complete send/check/
signup test, then an explicitly authorized real destination to check handset
delivery. Test numbers simulate verification and do not establish real delivery.
Confirm incorrect-code, changed-phone, expired-code, resend and duplicate-submit
behavior. Test destinations in the intended launch markets.

## Limits and deployment constraints

- Resend cooldown: 45 seconds.
- Code window: at most five minutes locally; provider expiry also applies.
- Five code-check attempts per active window. Retrying the same provider window
  cannot reset its local attempt count or deadline.
- Six send attempts per number per hour, including failed provider calls.
- 120 send attempts per source IP per hour.
- Successful proof: fifteen minutes, bound to E.164 phone, consumed once.
- Registration errors after proof consumption require re-verifying the phone.
  The UI clears the proof on failed registration.
- International parsing uses country metadata, including significant leading
  zeros and national trunk prefixes, not a Ghana-only prefix rule.

State and locks are **process-local**, as in the previous implementation.
Run a **single application process/replica** until shared atomic verification,
rate-limit and proof storage is implemented. A restart invalidates pending codes
and proofs; request a new verification. There is no insecure recovery fallback.

OTP source-IP resolution trusts only reverse-proxy CIDRs explicitly configured in
`AUTH_TRUSTED_PROXY_CIDRS`. Obtain those ranges from the hosting configuration;
do not blindly trust `X-Forwarded-For` or use a universal CIDR. Without configured
proxy trust, users behind the same hosting proxy share its IP allowance. Provider
fraud controls and spend limits should also be enabled in Prelude.
