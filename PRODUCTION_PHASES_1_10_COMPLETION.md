# Nanivio Production Phases 1–10 — Completion Package

This revision completes the implementation hardening for the ten-phase production plan. It is intentionally **fail-closed**: a missing external credential or unsupported provider route produces an explicit unavailable state instead of fabricated data/audio.

## 1. Authentication & user database
- Supabase-backed production authentication/session validation remains the source of truth.
- Personal, expert, business and driver account records are persisted.
- Password recovery uses Supabase Auth.
- Admin bootstrap is deployment-secret based; no demo accounts are seeded.
- Protected admin configuration endpoints require an authenticated admin session.

## 2. Paystack production payments/reconciliation
- Paystack initialization is server-side and tied to an authenticated Nanivio account.
- Fulfilment requires an authoritative durable Nanivio order and server verification.
- Webhooks require HMAC-SHA512 signature validation and idempotent event claiming.
- Unknown references are not marked as processed so a later retry can succeed after order persistence.
- No client-side payment success can mint balance.

## 3. Nanivio credit
- Nanivio credit is represented separately from money wallets.
- Credit mutation uses transactional PostgreSQL RPC/ledger paths.
- Production financial reads require persistent billing configuration.
- History is append-only; reversals/refunds are new ledger events.

## 4. Malvi AI Ecosystem credit
- Malvi credit account and ledger are separate from Nanivio credit.
- Malvi usage is persisted and debited transactionally.
- Missing Gemini/provider credentials fail closed rather than generating fake AI output.
- User-facing terminology is **Malvi AI Ecosystem credit**.

## 5. Langpretation
- Agora is the real WebRTC media transport.
- International translation uses Azure Translator/Speech where the selected language is actually supported.
- Ghanaian routes use Khaya only when the configured endpoint/key is present; East African routes use Sunbird only when a real configured route exists.
- Pivot routing is explicit; unsupported routes return unavailable.
- Voice-note raw-audio processing was added so a client transcript is not treated as proof of speech.
- Langpretation usage is persisted.
- The UI does not arbitrarily remove languages from the 18-language selector.
- No Palabra dependency is used by the core Langpretation path.
- No synthetic/generated waveform is used as translated speech.

**Important:** provider availability is dynamic. This package does not claim that all 306 cross-language speech pairs are simultaneously live-verified. The administrator matrix reports capability/configuration and fail-closed status; real provider subscriptions must be enabled for each required route.

## 6. Agora audio/video calling
- Agora Web SDK NG is used for microphone/camera tracks.
- Server issues signed Agora RTC tokens only for authenticated users.
- Join/leave tracking is protected.
- Translated provider audio can replace the publishing audio track during a translated utterance and restore the original microphone track afterward.
- No browser peer-connection mock is used as the call transport.

## 7. Messaging
- Stream Chat server integration is used for persistent messages/channels.
- Stream credentials are required; no fake in-memory production message store is accepted.
- Translation in chat is provider-backed and fails closed when unavailable.
- Authenticated Stream identities are required.

## 8. Nanivio numbers & contacts
- Real user records receive Nanivio IDs/numbers.
- Contacts/settings APIs persist to the production data store.
- Guest/demo numbers and demo billing seeds are disabled.

## 9. Notifications & media
- Notification read-state persistence is implemented.
- Media/attachment paths require real storage/provider URLs; no fabricated financial/media state is created.
- PWA install behavior remains client capability based.
- Telecom/PSTN endpoints fail closed until a real carrier workflow is configured.

## 10. Security, deployment, monitoring & final audit
- Production status endpoint exposes credential readiness without returning secrets.
- Persistent Langpretation admin configuration is stored in PostgreSQL (`migration 006`).
- Admin language configuration is protected and audited.
- Financial operations fail closed when durable billing is unavailable.
- Render build/start commands are production oriented.
- Deployment must run migrations before enabling paid production features.

## Required live verification before public launch
1. Apply migrations 001–006 in order.
2. Configure Supabase, Paystack, Agora, Stream, Azure, Khaya/Sunbird and Gemini credentials as applicable.
3. Deploy backend/frontend.
4. Test real registration/login/recovery.
5. Test a real Paystack test/live transaction according to the selected environment.
6. Test two real devices for Agora audio and video.
7. Test English ↔ Twi first, then every provider-supported Ghanaian/African route.
8. Test an international Azure route.
9. Test Stream messaging and attachments.
10. Test admin configuration persistence after a server restart.

The package is code-complete for these safeguards, but external-provider activation and end-to-end device tests cannot be truthfully marked complete without the corresponding production accounts/credentials and live network execution.
