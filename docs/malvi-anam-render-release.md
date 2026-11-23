# Gated Malvi voice and Anam release

## Status

Prepared for review, not pushed or deployed. This is not a claim that live
Anam speech, lip synchronization or the entire Nanivio application is ready.

The candidate is based directly on the confirmed remote
`malvi-production-upgrade` release, not on all unreleased workspace commits.
The reviewed commit and exact file list are recorded locally in
`generated-artifacts/malvi-anam-release/candidate.json`.

## Included

- Continuous microphone lifecycle and conservative, echo-processed local
  interruption, with cancellation-generation guards and explicit recovery.
- Shared input-only inactivity accounting: assistant speech cannot extend the
  user's deadline. This changes the older reply-playback renewal behavior.
- Cancellation-aware reference-tool responses and provider acknowledgements.
- Anam audio passthrough for personal and Business avatar renderers, retaining
  Nanivio's microphone, selected brain, approved voice and existing allowances.
- Server-owned Anam session creation, authenticated connection handoff,
  provider-specific expiry/stop cleanup, and sanitized provider-limit feedback.
- Anam's SDK and its two required additional dependencies.
- Vite's compatible maintenance update from 6.4.3 to 6.4.6. The clean installer
  blocked 6.4.3 under the package firewall's critical-vulnerability policy.
  The protection was not bypassed; the patched release passed installation.
- Related regression fixtures and a manual, bounded live-renderer probe.

Existing dependency versions are otherwise preserved from the production
lockfile. The workspace's unrelated Axios/redirect updates and Express override
are not silently added to this release.

## Excluded

No app-wide redesign, Langpretation routing changes, chat functionality changes,
new subscription prices, database migrations, Android implementation, provider
voice replacement or automatic Anam activation.

## Render settings and rollout

On the existing backend service, preserve all current environment settings.
Add `ANAM_API_KEY` and `ANAM_AVATAR_ID` through Render's secure environment
editor. Do not paste their values into source control or chat.

Keep this activation setting while Anam usage is exhausted or verification is
incomplete:

```env
MALVI_AVATAR_PROVIDER=heygen
```

After a separately approved push/deployment, replenished provider allowance and
a successful bounded live test, activation is an explicit change:

```env
MALVI_AVATAR_PROVIDER=anam
```

Do not remove the HeyGen credentials while that renderer remains selected.
Anam does not replace `GEMINI_API_KEY`, the selected ElevenLabs setup, Redis or
Supabase. No additional Anam brain, voice or translation key is required.

Before any push, recheck that the remote still matches the candidate's parent.
Use a non-forced update to `malvi-production-upgrade` only. Preserve all
excluded workspace work and do not reset the working branch to this candidate.

## Verification of the scoped source

The candidate was extracted outside the active app and installed from its own
frozen lockfile. No workspace `node_modules` or untracked application assets
were borrowed for these checks.

- Clean dependency installation passed after the Vite maintenance patch.
- TypeScript, dependency portability and production client/server build passed.
- The 302-test Malvi/microphone run passed 299 checks and exposed three stale
  baseline fixtures. Their production contracts were checked, and only the
  fixture files were updated: voice-policy entitlement isolation, authenticated
  realtime scheduling, and the existing missing-price error wording. All 18
  tests in those three affected suites then passed. No billing or authentication
  application code was imported to make those fixtures pass.
- Real-browser Anam-adapter fixture passed paired A/V, streamed utterance
  boundaries, immediate local muting, late-output rejection and cleanup.
- Business publisher fixture passed mobile/desktop publication and cleanup.
- Personal controller fixture retained capture through 31 seconds of generated
  playback, repeated interruptions and language changes. Its single synthetic
  interruption observation was 422 ms, not a production latency guarantee.
- Selected-provider/language fixtures passed cancellation acknowledgement
  recovery, ownership, no fan-out and input-only inactivity behavior.

Those checks incurred no additional provider sessions or paid inference.
The separate approved live attempt was blocked by Anam HTTP 429 before A/V
playback. The owner reported that the Anam usage allowance was exhausted.
The replacement key and avatar access passed, but physical-device acoustics,
live voice identity, live latency and lip synchronization remain unverified.
