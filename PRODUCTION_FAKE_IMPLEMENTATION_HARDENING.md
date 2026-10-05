# Nanivio Production Fake-Implementation Hardening

Date: 2026-10-04

## Objective

Remove fake-success behavior from live services. A provider that is not configured or does not return a real result must fail honestly instead of returning demo credentials, fabricated balances, synthetic audio, fake users, fake ride assignments, fake payment success, or fabricated telemetry.

## Hardened in this pass

### Authentication / administration
- Removed hard-coded administrator password and hard-coded master-key bypasses.
- Administrator bootstrap now requires `NANIVIO_BOOTSTRAP_ADMIN_EMAIL` and `NANIVIO_BOOTSTRAP_ADMIN_PASSWORD`.
- `ADMIN_MASTER_KEY` is now the only accepted master key and must be explicitly configured.
- Removed the shipped demo auth database file.
- Disabled production demo-account switching.
- Removed visible demo admin credentials from the UI.

### Financial / billing
- Subscription changes require persistent billing storage.
- Communication-minute purchases use the normalized PostgreSQL/Supabase ledger when paid with Nanivio credit.
- Malvi AI Ecosystem subscriptions use the normalized ledger when paid with Nanivio credit.
- Added persistent wallet-debit commands for communication minutes and Malvi subscriptions.
- Added transaction-level idempotency to the normalized billing command.
- Paystack fulfillment checks for an already-recorded payment before delivering value again.
- Billing history and dispute/credit reads are scoped to the authenticated user.
- Removed fabricated wallet values from Malvi.
- Removed fabricated admin transaction/user counts from Malvi.
- Removed heuristic/default pricing values from the billing engine.
- Removed hard-coded expert pricing fallback.

### Paystack
- Production Paystack remains server-authoritative.
- Authenticated user identity is taken from the server session rather than request-body `userId`.
- Duplicate fulfillment is rejected as an idempotent already-fulfilled operation.
- No fake checkout or fake wallet credit is generated when Paystack is unavailable.

### Langpretation
- Removed synthetic waveform output from voice-note processing.
- TTS requires authenticated production access and a real provider response.
- TTS no longer creates billing usage from estimated word-count duration.
- Browser-local ASR no longer returns an empty successful transcript.
- Khaya/Sunbird/NLLB MT providers no longer return the original text as a fake successful translation.
- Pivot translation no longer silently falls back to the original input.
- Realtime call/chat translation no longer uses Gemini as a hidden translation fallback; it uses the configured production translation providers.
- Call translation can inject real provider-generated TTS audio into the Agora published audio track.
- Langpretation route availability now reports `UNAVAILABLE` when the required production providers are not configured.
- Empty telemetry now reports zero rather than fabricated latency/quality/BLEU values.

### PSTN / telecom
- PSTN outbound calls no longer report a simulated call as successful.
- Twilio call creation now uses the real Twilio REST API and requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.
- Unsupported PSTN providers fail instead of pretending to originate a call.

### Business / services / mobility
- Removed generated synthetic business listings from the live location service directory.
- Removed seeded fake driver fleet/ride assignments from live ride UI.
- Removed hard-coded fake rider/driver identities from production dispatch flows.
- Disabled simulated driver arrival/dispatch/passenger-request success.
- Disabled sample 4K live broadcasts and sample video URLs from the live services hub.
- Production ride requests now call the backend and fail honestly when no live dispatch provider is connected.
- Google Maps UI no longer presents a demo-key path as a production integration.

### Payment gateway UI
- Removed fake Stripe, PayPal, Google Pay, Apple Pay and bank credentials from the initial gateway configuration.
- Paystack is the enabled card/payment gateway in the UI; unsupported external gateways remain disabled until real provider integrations are configured.

## Intentionally not claimed as production-connected

The following are deliberately fail-closed or remain marked for a dedicated integration pass rather than being falsely advertised as live:

1. GetStream channel persistence: the current Nanivio realtime layer still contains local WebSocket/channel compatibility code. Stream credentials alone do not make that local storage a real GetStream backend.
2. Nanivio Drive dispatch: no real driver-dispatch provider is connected in this build.
3. Mobile-money network settlement: manual deposit verification remains a controlled administrative workflow, not an automated carrier API.
4. Full 18-language speech-to-speech coverage: the language matrix remains 18x18 at the routing level, but actual ASR/MT/TTS capability is provider-dependent. Missing provider credentials result in unavailable routes rather than fake success.
5. Full persistent authentication/user/application registry: billing persistence is now separated and hardened, but the legacy AuthDatabase still uses server-local persistence and should be migrated to PostgreSQL/Supabase in the next infrastructure phase.

## Required production environment

At minimum, configure:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_MASTER_KEY`
- `NANIVIO_BOOTSTRAP_ADMIN_EMAIL`
- `NANIVIO_BOOTSTRAP_ADMIN_PASSWORD`
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `PAYSTACK_SECRET_KEY`
- `AZURE_TRANSLATOR_KEY` / region
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `KHAYA_API_KEY`, `KHAYA_ASR_URL`, `KHAYA_TTS_URL`, `KHAYA_TRANSLATION_URL` where Ghanaian speech is enabled
- `SUNBIRD_API_KEY` and real Sunbird endpoints where East African speech is enabled
- Twilio variables if PSTN is enabled
- Gemini/Malvi credentials if Malvi AI chat is enabled

Never place service-role, Paystack secret, Twilio auth, Agora certificate, Khaya, Sunbird, Azure, or Gemini secrets in browser/Vite environment variables.

## Verification status

A TypeScript pass was run against the source tree. The environment did not contain installed npm dependencies, so the compiler reported dependency-resolution errors; no remaining project-specific semantic errors were observed after the hardening changes. A full `npm install`, production build, Supabase migration run, provider smoke test, and Render deployment test must still be performed in an environment with network access and the real production secrets.
