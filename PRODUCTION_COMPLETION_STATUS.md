# Nanivio Production Completion / Hardening Pass

This package is a production-hardening revision of the Nanivio project. It removes or fails closed around several demo/fake paths and adds persistent identity, contacts, settings, billing summary, Stream persistence, and separate Malvi AI Ecosystem credit primitives.

## Implemented in this pass

- Persistent Supabase Auth-backed registration/login/session validation for personal, expert, business and driver accounts.
- Persistent Nanivio user profiles and application records.
- Persistent admin user/application lists and review actions.
- HMAC-signed bootstrap admin session token so master-key admin access still works when persistent auth is enabled.
- Password recovery routed through Supabase Auth instead of generated fake reset tokens.
- Persistent contacts and user settings APIs; browser local storage is no longer the authority for these records.
- Persistent notification read API foundation.
- Persistent billing summary/accounts/transactions/invoices backed by the normalized ledger.
- Separate `malvi_credit_accounts` and `malvi_credit_ledger` with a transactional PostgreSQL RPC for credit/debit operations.
- Persistent Malvi usage events and credit consumption.
- GetStream persistence moved away from the in-memory message store to authenticated Stream Chat REST calls.
- Stream token generation requires authenticated Nanivio identity.
- Agora token/join/leave routes require authentication and production Agora credentials.
- Text translation routes require authentication and no longer return a fabricated translated phrase.
- Client-supplied `call:speech` websocket payloads are no longer treated as live audio speech.
- Removed quick-phrase/simulated speech controls from the call UI.
- Real microphone audio visualizer retained; random waveform animation was removed.
- Synthetic TTS generation is not used; TTS requires provider-returned audio.
- Mobile-money wallet crediting is fail-closed until a real settlement provider is connected.
- Direct wallet crediting through arbitrary card/PayPal/Google/Apple claims is disabled.
- Paystack initialization uses the authenticated account email rather than trusting a client-supplied email.
- Paystack verification remains server-side and duplicate fulfillment is blocked through persistent payment records.
- Guest/demo Nanivio numbers were removed from the application state.
- Demo user billing seed `user_me` was removed from the billing database seed.
- Default client-side financial balances/transactions and fake expert/ad records were removed from initial live state.
- Admin feature/pricing state now fails closed instead of enabling unverified services/prices by default.
- Added `/api/production/status` to show non-secret provider configuration readiness.
- Added migrations 003, 004 and 005 for persistent identity/applications, contacts/settings/notifications, and Malvi credit/usage sessions.

## Provider truth model

The application now distinguishes between configured and unavailable providers. A missing provider credential results in an explicit unavailable/503 response instead of a fabricated successful result.

Required real production services include:

- Supabase PostgreSQL + Supabase Auth
- Paystack
- Agora RTC
- GetStream Chat
- Azure Translator/Speech for supported international routes
- Khaya credentials/endpoints for supported Ghanaian routes
- Sunbird credentials/endpoints only where the selected route is actually supported
- Gemini only for Malvi AI

## Important deployment order

1. Apply the existing billing migrations first.
2. Apply `migrations/003_production_auth_and_app_data.sql`.
3. Apply `migrations/004_contacts_settings_notifications.sql`.
4. Apply `migrations/005_malvi_credit_and_usage.sql`.
5. Configure the production environment variables from `.env.example`.
6. Deploy the backend.
7. Check `/api/production/status` after deployment.
8. Run real account registration/login, Paystack, Stream, Agora and Langpretation smoke tests before enabling the corresponding feature flags.

## Verification limitation in this environment

The source tree was statically checked for TypeScript syntax/semantic regressions, but a full dependency install/build could not be completed in the available execution window. The project should therefore be run through the normal Render `npm install`/build pipeline after the migration and environment configuration are applied.

No provider secret is embedded in this package.

## Malvi + Gemini Controller Pass
- Gemini is explicitly the server-side reasoning/controller engine for Malvi.
- Added constrained Gemini function declarations for Nanivio navigation, Langpretation configuration, expert discovery, transfer proposals, and admin-control proposals.
- Tool calls are converted to Nanivio-authorized actions/proposals; Gemini cannot directly mutate money, billing, admin privileges, or provider configuration.
- Added frontend confirmation handling for authenticated admin-control proposals.
- Added `MALVI_MODEL=gemini-3.8-flash` to `.env.example`.
- Added `docs/MALVI-GEMINI-CONTROLLER.md`.
