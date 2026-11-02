# Malvi plan implementation and activation status

This is an implementation record, not certification that every advertised
benefit works in production.

## Implemented

- Structured, administrator-editable memory, public-research and multimodal
  capabilities, plus linked avatar and Business flags.
- Server enforcement on new voice/avatar sessions, research, input analysis,
  live vision and saved-memory activation and recall.
- Purchased capability snapshots for future subscriptions. Verified Paystack
  checkout snapshots take precedence over later catalogue edits. Older terms,
  prices and purchased minute balances are not rewritten.
- Business rooms with authenticated membership, owner-issued hashed invitations
  expiring after 24 hours, and up to 12 members.
- Shared persisted ideas, opt-in/pasted transcripts, knowledge documents, task
  assignment and completion, AI analysis, summaries and text export.
- Automatic summary attempt when the owner closes a meeting containing shared
  transcripts. Failed inference never inserts a canned success response.
- Explicit-consent conference audio and optional video using the RTC provider,
  with participant-specific allowance reservations and short-lived tokens.
- Meeting transcription of the participant's own explicitly shared microphone
  segments, translated transcript text, and optional device playback of a Malvi
  response excerpt in the administrator-selected voice.
- In-call text/quoted-context assistance for eligible users, with no implied
  recording or access to the other caller's audio.

## Activation required

1. Apply `migrations/020_malvi_business_rooms.sql` in the existing Supabase SQL
   editor, after the existing plan catalogue and live allowance migrations.
   It is repeatable and does not reset purchased balances or terms.
2. Confirm `business_rooms_installed` is true.
3. Deploy the reviewed application changes to Render.
4. Review the administrator catalogue and shared usage safety limits.
   The Voice plan remains an unsold draft until an administrator configures
   prices and allowance and publishes it; no new prices were invented.
5. Test the deployed application with two authenticated Business accounts and
   explicit permission to spend speech and RTC credits.

Supabase setup is owner-run; no production schema or data was changed during
this implementation. No paid provider requests were run.

## Not complete or not proven

- Truly simultaneous multi-party **translated speech** is not implemented by
  translated transcript text. Current segmented transcription is not advertised
  here as a low-latency simultaneous speech channel or voice-clone service.
- Dedicated Premium priority inference routing is not implemented.
- Sub-second responses and zero pauses are not guarantees this implementation
  can provide for external providers and arbitrary networks.
- The Business co-pilot produces shared responses on request and a summary on
  close; it is not an autonomous avatar attending every conference turn.
- Live provider speech quality, avatar lip synchronization, two-account Render
  meeting media and phone-specific behavior require live verification.
- Organization-wide knowledge outside individual room membership is not yet a
  separate organization directory or knowledge-base product.

These gaps must not be marked completed merely because a feature description
appears on a pricing card.

## Verification evidence

- 95 focused automated tests passed across catalogue persistence/access,
  SQL migration and immutable purchase rights, workspace membership and
  concurrency, tasks, knowledge, AI failures, metering guards, memory, input
  analysis, voice policy and existing call lifecycle.
- TypeScript and production build passed.
- Actual Business React component and HTTP client passed mobile and desktop
  browser fixture checks for shared message submission, summary display,
  responsive layout and explicit AI failures without canned fallback.
- Existing admin and call-screen browser fixture regressions passed.
- The running preview restarted cleanly and the public landing page rendered.
  The screenshot browser was not signed in; signed-in production UI was not
  verified by that screenshot.
