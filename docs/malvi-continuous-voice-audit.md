# Malvi continuous-voice audit

## Before implementation

The existing architecture already has a persistent, selected Gemini/OpenAI brain,
Nanivio-owned PCM microphone capture, provider VAD, streaming native Gemini
speech or the approved ElevenLabs voice, playback-timed captions and a HeyGen
LITE renderer. Do not add another brain, microphone pipeline or browser TTS.

Concrete gaps found:

- `src/components/malvi/MalviLiveAssistant.tsx`: microphone activation is
  separate from conversation activation; language selection stops capture
  without resuming it. Local VAD only updates UI. Playback promise rejection
  can restore cancelled audio after interruption. Cancellation is duplicated
  across several event handlers.
- `src/lib/nanivioMic/BrowserMicCapture.ts`: requests browser echo cancellation
  but does not report whether the browser enabled it. Hardware loss stops
  capture but its feedback does not distinguish permission/device failures.
- `src/lib/nanivioMic/NanivioMicEngine.ts`: one-frame amplitude detection is
  useful for a volume meter, not sufficient for immediate playback cancellation.
  It needs a separate sustained-input gate, without suppressing any PCM.
- `src/server/assistant/liveBrain.ts`: a single above-threshold microphone
  frame synthesizes a cancellation. This can mistake noise/residual echo for
  speech and duplicates Gemini's own interruption detection.
- `src/lib/malviLiveAvatarSession.ts`: renderer-specific HeyGen adapter; the
  independently owned speech contract is already PCM16 mono at 24 kHz.

## Scoped implementation

1. Preserve the current streaming architecture and generation acknowledgement
   boundary. Keep all microphone frames available to the selected provider.
2. Start microphone capture after an explicitly labelled conversation activation
   and ready session; keep it active over speaking, thinking and language changes.
   Respect deliberate pause and require a user action after a capture failure.
3. Stop local playback/queues on sustained, echo-processed input; invalidate
   asynchronous callbacks, then request server cancellation. Retain provider VAD
   as the recognition authority. Acoustic energy alone is not proof of speech.
4. Remove the server's single-frame cancellation heuristic and make repeated
   cancellation requests idempotent until acknowledgement.
5. Expose actual microphone/echo-processing feedback, interruptions and processing
   states; keep permission/device/network failures explicit and capture stopped.

## Anam assessment

The user confirmed **https://anam.ai/** as the intended replacement, not “Anan”.
Official documentation:
https://anam.ai/docs/javascript-sdk/examples/custom-tts

Anam documents audio passthrough, disabled SDK microphone input, externally
generated PCM16 mono speech (native 24 kHz), interruption plus end-of-sequence,
and backend-created session tokens. This fits the owned brain/voice boundary.
Its documented initial renderer buffer is 480 ms of audio per sequence, not a
promise of total response latency. Avatar streaming is charged separately.

At assessment, this workspace has neither `ANAM_API_KEY` nor `ANAM_AVATAR_ID`;
no Anam integration connection was found. A provisioned custom Malvi avatar,
account access, lifecycle/expiry controls and live tests are prerequisites to
switching production. No stock avatar, static portrait or default Anam voice
may silently replace Malvi. Keep the existing renderer until those checks pass.

## Evidence boundary

Automated tests can verify queue cancellation, echo-processing configuration,
continuous PCM delivery, repeated interruptions, context/language contracts and
real-browser AudioWorklet execution with generated input.

They cannot certify physical speaker echo cancellation, Bluetooth/device behavior,
the sound of Malvi's voice, live mouth synchronization or production latency.
The supplied brief requires successful real-device/live scenarios before declaring
the full upgrade complete. Record those separately; never label fixtures as
provider or human-listening evidence.

## Implementation verification

- TypeScript check passed.
- 273 Malvi/microphone regression tests passed.
- Production client/server build passed; existing chunk-size/import warnings remain.
- Provider-adapter fixture passed selected-provider ownership, language/dialect,
  interruption acknowledgement recovery and no duplicate brain connections.
  Duplicate cancellation does not inject another synthetic user turn; a lone
  loud PCM frame no longer synthesizes cancellation.
- Real Chromium controller/capture/playback fixture kept one microphone active
  through **31 seconds** of synthetic playback. Generated microphone input
  stopped the actual audio source in **429 ms observed** in this single run.
  This includes test polling and is not a provider latency percentile.
- The same browser fixture passed repeated interruption, English/Arabic/French
  language-state changes without capture restart, deliberate pause retention,
  stale playback rejection, disconnected-device recovery, permission denial and
  retry, and network-loss cleanup.
- The real AudioWorklet/capture-adapter check passed at 16/44.1/48 kHz with
  mono and right-channel input and no late frames after stop.
- The development server restarted successfully and the public mobile sign-in
  screen rendered. The signed-in production Malvi UI was not visually verified.
- These checks made **zero external provider requests**.

| Required scenario | Evidence | Still required |
| --- | --- | --- |
| 30-second speech with microphone active | 31-second actual browser PCM playback and capture fixture | Live Malvi speech on physical speakers |
| Mid-sentence interruption stops speech | Actual browser audio source stopped on generated sustained input | Human speech and hardware latency |
| Speak while Malvi talks; next turn works | Browser overlap and provider-adapter fixtures | Connected live brain and renderer |
| No repeated self-echo responses | Synthetic silent input did not interrupt; echo-processing settings checked | Speaker/headset acoustic test; settings do not prove cancellation |
| Repeated interruptions | Browser repetitions and cancellation-generation tests | Long live conversation |
| Context after interruptions | Provider connection, transcript and language-state fixtures | Human semantic/context assessment |
| Devices, noise and network | Generated-input noise/transient gate, device/permission/network failure fixtures | Physical built-in mic, headset/Bluetooth, real background noise and mobile network |
| Languages and approved voice | Language-routing/provider-selection regression tests | Audible identity/quality and lip-sync review in selected languages |

## Remaining release gates

The replacement Anam key passed the read-only configured-avatar check with
**HTTP 200**. An approved one-session, 30-second live probe then received
**HTTP 429** during initialization, before obtaining a provider session ID or
reaching A/V playback. Its initial failure did not capture the request stage,
so the exact cause must not be inferred. Subsequent read-only concurrency
reported **0 active / 1 allowed**, and a token-only diagnostic succeeded with
**HTTP 200**, without starting a stream. No second live initialization was
attempted. Transient rate limiting, usage/billing limits and other provider
constraints remain to be distinguished; the capacity snapshot alone does not
establish the cause of the earlier refusal.

Live avatar identity, actual voice and lip synchronization remain unverified.
No production renderer switch or Render deployment was performed. The full task
remains incomplete until live/physical-device acceptance criteria pass.

OpenAI's existing Live protocol adapter still fails closed on cancellation rather
than pretending its undocumented response-cancel operation works. This work does
not certify uninterrupted OpenAI barge-in or silently switch it to Gemini.
Browser-reported echo cancellation is necessary for the conservative local
amplitude gate, but not evidence of acoustic cancellation quality; when it is
unconfirmed, show a headphones warning and rely on provider recognition/VAD.

## Anam integration milestone

- Added the official JavaScript SDK, with its input audio explicitly disabled.
  The existing Nanivio microphone, selected brain and approved speech generator
  remain independent. No Anam voice/LLM replacement or silent fallback is used.
- The renderer receives streamed PCM16, mono, 24 kHz and seals once at the actual
  utterance boundary. Interrupted output is locally muted immediately; queued
  audio is invalidated by the existing controller barrier. Transport interruption
  and audible lip synchronization still require live verification.
- Both personal and shared Business avatar publishers use the same renderer
  adapter. Business retains its separately authorized meeting escrow.
- `MALVI_AVATAR_PROVIDER=anam` explicitly selects the new renderer; omission
  preserves HeyGen during validation. The selection has **not** been enabled.
  Existing sessions retain their original provider for cleanup even if the
  configuration changes.
- The server creates an Anam passthrough token with one allowed start, a
  two-minute token expiry and a provider-enforced duration bounded by the
  purchased/reserved allowance and Nanivio's ten-minute maximum. It then starts
  and registers the actual provider session itself, before returning anything
  to the browser. The spent token cannot start another provider session.
- The SDK's start request is handed the saved connection by a browser-only
  authenticated same-origin endpoint. It does not forward client configuration,
  create a second session or accept an Anam token as Nanivio authentication.
  Ownership, expiry and meeting access are rechecked against the session record.
- Server idle sweeps, explicit endings and persistence-failure cleanup dispatch
  to the provider actually recorded on the session. Failed remote stop retains
  the reservation for retry instead of pretending cleanup succeeded.
- Anam recording and transcript retention are explicitly disabled in the token
  configuration; this is not a claim of full provider Zero Data Retention.
- Seven additional fixture tests cover provider payloads, authorization failures,
  ownership, remote cleanup, idle sweeping and failed persistence/cleanup.
  A real-browser adapter fixture verifies paired A/V tracks, streamed utterance
  boundaries, immediate local muting, resource cleanup and refusal of late audio.
  These are not evidence of live Anam connectivity or lip synchronization.
- Shared Business browser tests passed at mobile/desktop sizes, and the
  personal continuous microphone browser regression passed again with a
  **638 ms** synthetic interruption observation in that run. The difference
  from the prior 429 ms result underscores that neither is a production latency
  guarantee. Both runs used no provider sessions.
- Dependency download URLs were checked against canonical npm tarball
  integrity, preserving portable Render builds without disabling the workspace
  package firewall.
- Final verification of this integration passed **301 tests**, TypeScript,
  the personal/shared and Anam-adapter browser fixtures, dependency portability
  and the production client/server build. Existing bundle-size warnings remain.
- Added a bounded manual live probe using the saved, owner-approved Malvi
  reference, with provider-enforced 30-second duration, explicit stop and
  watchdog cleanup. Provider-limit errors now identify the failed request
  stage and allowlisted limit categories without exposing raw provider data.
