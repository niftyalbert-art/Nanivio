# Translation production readiness

This is the post-repair status of the task workspace, not a declaration that
the deployed Render application has received or verified these changes.

## Implemented

- One service-specific language plan drives the matrix, browser planners,
  authenticated HTTP translation, WebSocket chat translation and fan-out.
  Specialist-to-specialist pairs select each English-pivot leg independently.
- All 18 languages remain in the catalogue. Unknown codes are rejected.
  Mandarin and Luganda use Azure's `zh-Hans` and `lug` translation codes.
- Central translation, speech authorization, ASR and TTS requests carry the
  signed-in account's bearer token to the application's API only.
- The central ASR subsystem and African call speech capture send real microphone
  WAV audio to server-side recognition. International call capture uses Azure
  Speech. No synthetic microphone or browser-caption fallback proves recognition.
- Khaya speech uses its documented ASR v3/TTS v2 operations with ISO speech
  language codes. Optional URLs override documented HTTPS defaults.
- Sunbird ASR uses multipart `audio` and ISO `language`; TTS uses Bearer
  authorization, ISO codes and raw-audio `response_mode: stream`. It does not
  mistake an audio URL or JSON metadata for playable audio.
- Translated voice notes now use one authenticated server pipeline for actual
  ASR, complete MT, real TTS and persistent usage recording from measured input
  WAV duration. Empty recording, translation or playback preparation failures
  do not send silent/untranslated audio as a successful translated message.
- Both call directions select the remote recipient's language. Translated
  Agora audio is serialized, respects mute, restores the microphone and closes
  its audio context. Provider/publication failures propagate as errors.
- No NLLB inference, Google fallback or dialect normalizer is advertised as an
  implemented production fallback. Provider status starts unverified/offline.
- Verification dates, costs, linguistic confidence, BLEU, quality scores,
  jitter and empty-tracker success/latency benchmarks are no longer invented.
  ASR/TTS timing remains unknown for text-only translation measurements.
- Fan-out reports per-language failures and partial results, not untranslated
  input reported as a successful target translation.

## Verification completed

- TypeScript check.
- Production frontend and server build; existing bundle-size warnings remain.
- 46 regression tests after syncing with the main project, including exhaustive 324-combination planning consistency,
  authentication boundaries, privacy and billing-access regression checks.
- The sync preserves both credential-filtering implementations and the main
  project's public-profile allowlists and persistent application identities.
- Zero disagreements between the matrix and both browser planners.
- New speech endpoints reject unauthenticated requests with HTTP 401.
- Running mobile-width public preview renders; authentication remains enabled.
- Authenticated API verification: 27/29 checks passed. Nanivio-number audio/video
  invitations, accept, decline, timeout, disconnect, signed RTC tokens and
  authenticated quota reads passed. English → Twi returned real translation.
- Khaya Twi synthesis returned 92,218 bytes of actual audio through the
  authenticated application endpoint. The subsequent provider-generated-audio
  ASR request timed out; this is not a successful speech round trip.
- Signed-in browser verification: 17/18 checks passed. Both accounts signed in
  through the real form; the Account and missed-call layouts fit 390px screens;
  both users joined actual Agora audio/video channels. Central-engine and
  adapter requests carried authentication and propagated actual provider results.
  The browser had no physical microphone/camera, so media playback was not
  approved. No generated device stream was substituted.
- Development watching excludes runtime caches and documentation, in addition
  to tooling logs, so those writes do not reload an active verification call.

Planning tests are not live translation tests. The matrix does not mark
unmeasured pairs as live verified.

## Remaining production blockers

The user requested saving and pushing the completed repairs while deferring
the remaining verification because Azure is not currently accessible.
This is a partial verification handoff, not approval of all 18 × 18 routes
or production media readiness. Resume the checks below when the required
provider access and real devices are available.

1. **Azure configuration:** this workspace lacks `AZURE_TRANSLATOR_KEY` and
   Azure Speech key/region configuration. Translator region may also be needed
   for the provisioned resource. Supabase and Agora do not supply these services.
2. **Sunbird inference:** previous real text requests to the current official
   translation operation timed out. A reachable documentation page or configured
   key does not establish working inference. Recheck real output before approval.
3. **Distinct Akuapem MT:** a real English → `atw` request to the configured
   Khaya translation endpoint returned HTTP 400. The current engine therefore
   marks its 34 non-self directed combinations unsupported, rather than
   substituting generic Twi. This is not proof that every provider or future
   Khaya version lacks Akuapem support. A working distinct-dialect contract and
   actual output are required to enable it.
4. **Khaya recognition:** the real ASR request failed or timed out within the
   20-second bound despite working text translation and speech synthesis.
   This does not prove an invalid key or exhausted quota. Its service must
   return actual recognition before the Twi speech pipeline can pass.
   Sunbird speech also remains unverified. Provider-generated speech round trips
   do not establish physical microphone capture or human playback.
5. **Full live coverage:** all 306 translation directions, two-device audio/video
   playback, interruptions, mobile permissions and authoritative quota changes
   during actual media still require successful evidence.
6. **Promotion:** these are workspace changes. No production deployment or
   production-connected branch update was performed from this task fork.

## Provider contract sources

- Khaya SDK configuration:
  https://github.com/Khaya-AI/khaya-sdk/blob/main/src/khaya/config.py
- Khaya ASR/TTS wire contracts:
  https://github.com/Khaya-AI/khaya-sdk/tree/main/src/khaya/services
- Khaya language catalogue (not an exhaustive service whitelist):
  https://khaya-sdk.readthedocs.io/en/latest/languages/
- Current Sunbird task contracts:
  https://api.sunbird.ai/tutorial

Keep credentials in the workspace's secure configuration, never in reports,
source, screenshots or test output.
