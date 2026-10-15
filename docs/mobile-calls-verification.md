# Mobile calls and translation verification

## Status: blocked — not verified

This is a verification record, not a successful end-to-end test report.
Authentication and the persistent-financial-state startup guard were left intact.
No fabricated provider responses, payment records, account balances, or authenticated sessions were used.

## Checks performed

- `npm run lint` (`tsc --noEmit`): passed.
- Development secret-existence check: Agora app ID/certificate, Supabase
  URL/service-role key, Azure Translator/Speech configuration, Gemini, Khaya,
  and Sunbird secrets checked were absent.
- Integration search for Agora, Azure Translator, and Supabase: no matches.
- Started workflow with `PORT=5000 REQUIRE_PERSISTENT_AUTH=true npm run dev`.
  Initial startup failed before opening a port:
  `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Nanivio will not start with in-memory financial state.`
- Source inspection confirms WebSocket presence authenticates a session token
  and derives the user's identity from the authenticated account. Translation
  and Agora token/join endpoints have authentication middleware. These are
  source observations only, not live authentication or routing verification.
- The existing audit suite seeds subscription and wallet data, so it was not
  used as evidence for this real-provider task.

## Remaining acceptance checks

All the following require a running app with real provider configuration and
two authenticated accounts:

| Requirement | Result |
| --- | --- |
| Audio invite, accept, Agora join, bidirectional playback | Not run |
| Video invite, accept, Agora join, bidirectional playback | Not run |
| Decline and caller notification | Not run |
| Ring timeout and missed-call history | Not run |
| Disconnect cleanup and media teardown | Not run |
| Nanivio-number routing to the correct signed-in recipient | Not run |
| Actual translation output from a configured provider | Not run |
| Real session quota consumption | Not run |
| Signed-in mobile Account layout | Not run |
| Signed-in mobile missed-call layout | Not run |
| Live rejection of unauthenticated HTTP/WebSocket requests | Not run |

## Prerequisites and resumption

Configure the existing Supabase backend, including its public/anon key, rather
than substituting a new database or enabling in-memory fallbacks. Add real
Agora credentials and the appropriate translation/speech provider credentials.
Azure supports a suitable initial non-African-language translation check;
Khaya and Sunbird require their own configuration for their language routes.

Then restart the workflow and sign in through the normal authentication flow
with two real accounts on media-capable clients. Record actual provider
responses, before/after quota readings, call outcomes and history, and mobile
layout evidence without recording credentials or session tokens.

No provider-backed result or signed-in mobile layout has been verified yet.

## Development startup recovery

The development server now serves a configuration-required page when Supabase
is absent. This is a separate setup-only application: normal routes, financial
state hydration and realtime signaling are not mounted. All API requests return
503 and WebSocket upgrades are rejected. Production startup still fails when
the persistent database is missing.

Verified after the change:

- `npm run lint`: passed.
- `node --import tsx --test tests/setup-preview.test.ts`: passed. Checked the
  setup page, no-store response, API GET/POST rejection and WebSocket rejection.
- Production-mode startup without Supabase: still refused to start.
- Restarted development workflow: running on port 5000.
- Mobile screenshot at 390 × 844: configuration page readable without overflow.

This restores a useful development preview, not sign-in or provider operation.
The original real-call, translation, quota and signed-in layout checks remain
blocked by missing configuration and authenticated accounts.
