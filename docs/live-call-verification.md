# Real call and translation verification

Date: October 14, 2026, Pacific time (October 15 UTC).

**Status: incomplete. Do not treat this as full mobile or translation approval.**

## Scope and safety

The user authorized creating two dedicated, non-admin test accounts. Both were
created using the application's normal personal-registration endpoint, with real
Supabase authentication and real Nanivio-number allocation:

| Account | Nanivio number | Role | Status |
| --- | --- | --- | --- |
| Nanivio QA A | 0486381063 | PERSONAL | ACTIVE |
| Nanivio QA B | 0486435105 | PERSONAL | ACTIVE |

Their credentials were kept only in the local verification worker's memory.
There were no purchases, paid-credit grants, payment simulations, or modifications
to existing accounts through the test driver. No provider responses or browser
media devices were fabricated. Both accounts also authenticated against Render,
so this is not an isolated fixture database.

The Render build fix was already merged and its successful deployment was
confirmed by the user. The subsequent call/translation repairs below are in this
task workspace only; they have **not** been merged into the Render-connected branch.

## Actual evidence

| Check | Workspace | Render |
| --- | --- | --- |
| Password sign-in using each real Nanivio number | Passed | Passed |
| Both authenticated sessions resolve to their own PERSONAL account | Passed | Passed |
| Non-admin accounts cannot access the admin users endpoint | Passed, HTTP 403 | Passed, HTTP 403 |
| Both accounts authenticate on real WebSocket connections | Passed | Passed |
| Audio invite routes by Nanivio number with the verified caller identity | Passed | Passed |
| Video invite routes by Nanivio number with the verified caller identity | Passed | Passed |
| Both peers receive acceptance/connected signaling | Passed, audio and video | Passed, audio and video |
| Both accounts obtain credential-signed RTC tokens | Passed, audio and video | Passed, audio and video |
| Both real Agora browser SDK clients join the actual provider channel | Passed, audio and video | Not tested against the Render UI |
| Normal hangup reaches the other participant | Passed | Passed |
| Recipient decline reaches the caller | Passed | Passed |
| Unanswered invite times out on both peers after 30 seconds | Passed after repair | Not verified |
| Recipient disconnect ends the remaining caller's session | Passed after repair | Failed: no end event within five seconds |
| Real unanswered invite appears in missed-call history | Passed in authenticated browser | Not verified |
| Exactly one missed-call record per unanswered invitation | Passed after repair | Not verified |
| Both signed-in Account layouts fit 390px width | Passed in Chromium mobile emulation | Not verified |
| Missed-call dialog fits a 390 x 844 viewport | Passed in Chromium mobile emulation | Not verified |
| Khaya/Sunbird browser adapters send authenticated requests | Passed after repair | Not verified |
| Unavailable translation is rejected rather than presented as success | Passed after repair | Endpoint reported untranslated input |
| English-to-Twi endpoint produces actual translated output | Passed after provider configuration and contract repairs | Failed: untranslated passthrough |
| English-to-Luganda endpoint produces actual translated output | Blocked: configured URL returned speech synthesis, not translation | Failed: untranslated passthrough |
| Authenticated quota meter can be read | Passed, HTTP 200 | Passed, HTTP 200 |
| Genuine microphone/camera capture and remote media playback | Blocked: no input devices | Not verified |
| Actual allowance consumption during genuine translated media | Not verified | Not verified |

The updated workspace API suite passed 26 of 27 assertions, including real
English-to-Twi output from Khaya. It now also tests Sunbird in the workspace; that
provider's configured URL returned an audio-synthesis response rather than
translation. The authenticated browser suite
passed 15 of 16 assertions; the unavailable physical input devices were the
remaining failed prerequisite. Render passed 23 of 26 assertions, with failures
for disconnect cleanup and the two tested translation language pairs.

These are separate suites and targets, not an aggregate feature-pass percentage.
Some assertions cover the same workflow at different layers.

## Repairs made in this workspace

1. **Call lifecycle cleanup:** add a server-authoritative 30-second ringing
   deadline, cancel it on acceptance/end/decline, clean up call participants,
   and terminate calls when an account's last authenticated connection closes.
   Another tab or device remaining online is not treated as a full disconnect.
2. **Missed-call duplication:** use the actual call ID for idempotent insertion.
   A React development-mode replay previously produced two entries for one
   unanswered invitation. Ignore end events belonging to another pending invite.
3. **Translation adapters:** send the authenticated bearer header and reject
   unsuccessful/untranslated server responses. Khaya and Sunbird previously
   accepted an HTTP-200 untranslated response as a successful translation.
   Remove invented confidence values from these adapter results.
4. **Repeatable evidence:** add explicitly opt-in real-provider checks using
   actual registration, sign-in forms, WebSockets, and Agora SDK channel joins.
   Keep generated evidence outside version control and deployment.
5. **Provider contracts:** share Khaya/Sunbird HTTP clients between HTTP and
   WebSocket paths. Add the missing Sunbird bearer header, honor its configured
   URL, map English/Luganda/Swahili to its ISO 639-3 codes, map the app's Twi
   code to Khaya's documented code, and accept Khaya's JSON-string translations.
   Use bounded requests and safe diagnostics without logging keys, URLs, input
   text, or upstream values. Do not send translation requests to known
   non-translation paths on the official Sunbird host.
6. **Stable development verification:** exclude workspace logs, agent metadata,
   and generated test evidence from Vite watching. Workflow-log writes were
   triggering full-page reloads during browser checks, interrupting media-device
   enumeration and missed-call handling. These interrupted runs are retained as
   evidence, not counted as passing device or call tests.

## Translation follow-up after provider settings were supplied

An actual authenticated English-to-Twi request now returned:

> Hello. Ɛnnɛ yɛ 2026-10-15. Meda mo ase wɔ mmoa a mode maa mo no ho.

The input was "Hello. Today is 2026-10-15. Thank you for your help." The response
identified `khaya-ghana-nlp`, reported success, and was not cached. This is real
provider output, not a claim of native-speaker translation-quality approval.
The subsequent normal-sign-in browser run also confirmed that the actual Khaya
adapter returned a successful provider translation. It retained correct failure
handling for Sunbird, passed both accounts' real Agora audio/video joins and
mobile layouts again, and listed only an audio-output device.

Sunbird returned HTTP 200 but the response contained audio-synthesis fields
such as `audio_url`, `voice`, `sample_rate`, and `duration_seconds`, not translated
text. Those response values were not logged or saved. Its translation URL needs
to point to the documented text-translation service:
`https://api.sunbird.ai/tasks/translate`.
Further calls to official non-translation paths are now rejected locally.
No API key replacement has been shown necessary.

Provider contract references:
- https://khaya-sdk.readthedocs.io/en/latest/languages/
- https://api.sunbird.ai/tutorial

## What the evidence does not prove

- Agora returned CONNECTED for both real clients, but neither published media.
  No microphone or camera was available; only an audio-output device was listed.
  This does not establish microphone permissions, camera capture, audible
  playback, video rendering, iOS/Safari behavior, or physical phone compatibility.
- A mobile-size Chromium viewport verifies layout, not physical mobile hardware.
- Render's configuration endpoint reports the translation services configured.
  Nevertheless, the tested translation endpoints returned the input unchanged,
  with `success: false` and `provider: untranslated-passthrough`.
  Those production failures have not been re-diagnosed with server-side access.
  The workspace now has independently confirmed Khaya output and a Sunbird
  endpoint mismatch; do not assume Render has the repaired code or configuration.
- A readable quota meter does not prove consumption. The driver did not submit
  fabricated usage records to create a passing quota result.
- GetStream's configuration flag is not a live private-chat or provider-delivery
  verification.
- These observations do not authorize migrating the whole upgrade into Nanivio main.

## Validation

- `npm run lint`: passed.
- Billing/privacy/setup and pure translation-contract tests: 33 passed.
- Dependency portability tests: 5 passed.
- `npm run build`: passed; existing chunk-size/import warnings remain.
- `git diff --check`: passed.
- Managed workflow restarted after each coherent repair batch and started cleanly.
- Development watch exclusions checked using Vite's normal configuration loader.

## Evidence files

The private, generated evidence directory contains sanitized JSON results and
actual authenticated screenshots:

- `generated-artifacts/live-call-checks/results.json`
- `generated-artifacts/live-call-checks/account-a-mobile.png`
- `generated-artifacts/live-call-checks/account-b-mobile.png`
- `generated-artifacts/live-call-checks/missed-calls-mobile.png`

The results retain earlier failed observations as well as later passing checks.
Use the latest run for each target, rather than treating every historical failure
as a current workspace failure.

## Remaining work

1. Correct the Sunbird translation endpoint and require actual Luganda output.
   Khaya's actual English-to-Twi output has now passed; other language pairs and
   linguistic quality have not been comprehensively verified.
2. Run a genuine two-device microphone/camera session, including actual remote
   audio/video playback and disconnect behavior on mobile.
3. Compare authoritative allowance before and after real translated media,
   including exhaustion behavior, without granting paid credit or faking usage.
4. Re-verify any repaired deployment after its source changes are accepted.

Until those checks pass, the real-call/translation verification remains incomplete.
