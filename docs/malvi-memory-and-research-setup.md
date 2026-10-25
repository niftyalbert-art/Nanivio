# Malvi continuity, camera and public research

## Existing Supabase database

Apply `migrations/011_malvi_conversation_memory.sql` in the SQL editor of the
**existing Nanivio Supabase project**, after the existing user/auth migrations.
It adds two private tables and two server-only functions. It does not replace
the database, migrate users or import browser histories.

The server uses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
Do not put the service-role credential in client code. No new API secret is
needed for memory. Missing tables produce an explicit unavailable message:
the microphone/conversation can still work, but memory is not advertised as saved.

Users enable **Conversation memory** in Malvi. This saves future text and voice
transcripts under the authenticated account ID, not raw audio or image files.
Turning saving off prevents retrieval and new writes. Delete removes this
account’s saved transcripts and disables saving. Changes apply to a new live
session; disabling/deleting closes memory-bearing sessions on this server.
For multi-instance hosting, the frontend must also close its active connection.

Existing owner-scoped local text history remains separate. Unowned legacy
history is never automatically imported into cloud memory. The old local
“new conversation” button clears browser history, not the cloud archive:
use **Delete saved history** for that.

Recent and relevant archived messages are loaded into model context, not the
entire archive. Older topics can be found with the read-only recall tool.
An archive is not a guarantee of perfect recall, and saved conversation does
not grant authorization or verify current account information.

## Vision

Requires the administrator-selected **Gemini live brain**. While connected,
expand **Share a view**, enable the camera, and tap **Share this view**, or choose
a JPEG/PNG and tap **Share image**. Camera permission is required.

Only explicitly shared snapshots go to the selected AI. No continuous video
stream or automatic screenshots; stop-camera and close clean up tracks.
Snapshots are limited to 512 KB and prepared at up to 640×480. Images are not
saved to Nanivio’s conversation archive. The AI provider’s data policies still
apply. Consented text descriptions may appear in saved transcripts.

Malvi can describe visible objects, colours, text and surroundings, but must not
identify people or infer health, emotional state, ethnicity or other sensitive
traits from appearance. She must acknowledge uncertainty.

## Internet research

Uses the existing server-side Gemini key and Google Search grounding.
No new social-media login is needed. The optional server variables are:

- `MALVI_RESEARCH_MODEL`: default `gemini-3.8-flash`.
- `MALVI_WEB_RESEARCH_ENABLED=false`: administrator kill switch.

Search/model usage may be billed by the provider. A live conversation permits
at most six research tool calls, with a per-server, per-account limit of four
research calls per minute. These are abuse safeguards, not a distributed
account-spending ledger; hosting multiple instances multiplies those limits.

Research supports the public web and publicly indexed social posts only.
It cannot access private messages/profiles, login-only posts, deleted content,
or guarantee accuracy. Evidence-dependent answers show returned source links,
claim-to-source mappings, checked time, limitations and provider search
suggestions. Empty/unattributable grounding must not be presented as verified
research. Provider-generated summaries are still not independent fact checks.

## Verification before production claims

Run the new SQL and application tests, then deploy to Render and verify with
two separate signed-in accounts on the intended phones. Check memory opt-in,
text/voice return greetings, older-topic recall, disable/delete, camera denial,
snapshot sharing and cited web research.

The local automated tests use mocked provider responses and synthetic camera
input. They do not spend provider credits, establish production readiness, or
prove Android speech latency/lip synchronization. Streaming starts after about
400 ms of generated native audio plus transcription; total response time also
depends on recognition, provider generation, avatar rendering and network.
