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
- Bounded Premium/Business priority scheduling for queued application inference.
  Ordinary work is not starved or interrupted. This is per server process and
  does not change provider-native live-session scheduling.
- Streaming group speech Langpretation: one provider stream per consenting
  speaker, broadcast only to authorized, explicitly listening room members.
  Each meeting uses one owner-selected common target language, locked while
  open. Only the provider's actual ten-language allowlist is offered, not a
  claim that every 18×18 combination is validated. Voice preservation is opt-in.
- Independent playback per speaker, late-listener sequence announcements and
  immediate owner-close revocation. Translation errors restore original audio
  without hanging up the ordinary meeting.
- Opt-in automatic answers to shared microphone transcripts addressed to Malvi,
  with persistent cross-process claims to prevent duplicate inference. Failures
  produce an explicit room notice, not canned responses.
- Owner-invited live co-pilot avatar, published as a separate RTC participant.
  The owner hosts one real renderer, relays its synchronized audio/video and
  feeds new shared AI replies to that renderer in the managed voice. No new
  microphone is opened by the avatar and old room history is not replayed.
- The shared avatar is bounded by the owner's existing conference escrow:
  no second minute reservation and no refund of conference minutes when only
  the avatar is stopped. Room consent and the original lease are rechecked.

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

Supabase setup is owner-run; no production schema or customer data was changed.
Two explicitly approved short paid provider checks were run as described below.
The application changes have not been pushed or deployed to Render in this turn.

## Not complete or not proven

- Sub-second responses and zero pauses are not guarantees this implementation
  can provide for external providers and arbitrary networks. The default feature
  wording now says priority processing for queued Malvi requests. Existing
  administrator-authored catalogues and purchased terms were not rewritten;
  administrators must review any absolute latency claims already published.
- Group speech uses a common meeting language, not a different target for each
  recipient. The limited provider check did not verify overlapping live human
  speakers, an entire spoken utterance, accent quality or cloned-voice identity.
- The co-pilot responds to explicitly shared addressed transcripts. It is not
  an always-listening unattended bot with access to every participant's audio.
- Audible speech quality, avatar lip synchronization, actual relayed media in a
  two-account Render meeting and phone-specific behavior need live verification.
- Organization-wide knowledge outside individual room membership is not yet a
  separate organization directory or knowledge-base product.

These gaps must not be marked completed merely because a feature description
appears on a pricing card.

## Verification evidence

- 126 focused automated tests passed across catalogue persistence/access,
  SQL migration and immutable purchase rights, workspace membership and
  concurrency, tasks, knowledge, AI failures, metering guards, memory, input
  analysis, voice policy, priority fairness, automatic co-pilot claims, verified
  conference escrow reuse, listener authorization and existing call lifecycle.
- TypeScript and production build passed.
- Actual Business React component and HTTP client passed mobile and desktop
  browser fixture checks for shared message submission, summary display,
  responsive layout and explicit AI failures without canned fallback.
- Browser checks exercised the real group playback controller with two speaker
  streams, corrupt-sequence recovery, original-audio restoration and unsubscribe
  cleanup, using isolated transport and synthetic PCM.
- The actual avatar publisher React component passed mobile/desktop fixtures
  for two-track publication, queued reply speech, stop cleanup and cancellation
  before a late session response. SDK/RTC fixtures made no paid requests.
- One actual English-to-French provider stream delivered first translated audio
  chunks (6,720 PCM bytes each) and French transcript data (70 characters each)
  to two isolated authorized listener peers. First audio arrived 8,363 ms after
  startup, including connection and input time. This is not a complete spoken
  quality assessment or a real two-account application call.
- One actual live-avatar startup decoded 108 video frames, with one attached
  video track and one audio track. No microphone, brain session or lip-sync
  assessment was involved; the provider session was explicitly stopped.
- Existing admin and call-screen browser fixture regressions passed.
- The running preview restarted cleanly and the public landing page rendered.
  The screenshot browser was not signed in; signed-in production UI was not
  verified by that screenshot.
