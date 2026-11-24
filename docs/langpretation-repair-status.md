# Langpretation repair verification

## Scope

Two application corrections are prepared for release review:

1. The receiver enforces its existing six-second playback bound against the
   complete proposed queue, including the incoming PCM packet and startup
   padding. Previously, a large first packet or an additional packet on a
   nearly full queue could exceed that bound before the check noticed.
   Overflow is rejected through the existing playback-error recovery path.
   This does not shorten recognition, translation or synthesis provider time.
2. A voice-note processing deadline that aborts an adapter is classified as
   HTTP 504 with a stage-specific timeout message. Explicit user cancellation
   remains HTTP 499. Previously, an adapter's ordinary AbortError could turn a
   genuine pipeline timeout into a generic HTTP 502 failure.

No provider selection, subscription allowance, customer balance, database
schema, microphone consent or Malvi voice/avatar setting is changed.

## Local evidence

- The new voice-note deadline tests reproduced the incorrect HTTP 502 result
  separately in recognition, translation and synthesis before the correction.
- TypeScript, production build and selected local regressions passed.
- New playback tests cover oversized first packets, cumulative queue overflow,
  allocation rejection and normal continuously scheduled playback.
- Call UI fixtures cover activation, duplicate prevention, pause/resume, denied
  allowances, microphone reuse, specialist WAV capture and same-language audio.
- A two-browser PCM fixture passed bidirectional encoded capture and scheduled
  audible-signal output.
- The fuller audio and video call fixtures passed call signaling, language
  synchronization, recipient consent, translated PCM, visible captions and
  teardown with simulated providers and native RTC.
- An isolated PostgreSQL ledger verified that translated call time settled
  against the sponsor and the recipient remained uncharged. No customer
  balances or production database rows were changed.

The call fixtures were updated for current playback-preparation and private
account/voice-profile lookup contracts. They explicitly exclude live identity
and database adapters, including extensionless imports, from their backend
bundle. They do not bypass authentication in the application.

The smaller release was also reconstructed directly on the confirmed deployed
branch, installed with its own frozen lockfile, and checked independently of
the broader workspace. All 143 selected checks, the production build and the
three browser fixtures passed there. Two old baseline test files were aligned
with existing reservation/error contracts and isolated audio transport; no
unrelated provider-routing changes were imported to satisfy those tests.

## Boundaries and remaining acceptance

These are local code and fixture results, not live Render account acceptance.
No paid speech session or inference request was used for this batch.
Live two-account audio/video checks, text and voice-note delivery, actual
recipient playback latency, linguistic quality and consented voice identity
remain to be verified against the intended deployed release.

The test language examples do not certify the full advertised language matrix.
No claim of instantaneous translation or universal voice preservation is made.
Anam availability and Malvi's separate live avatar acceptance are not changed
by these Langpretation fixes.
