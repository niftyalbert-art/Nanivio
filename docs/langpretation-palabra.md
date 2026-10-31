# Langpretation international live-call speech

## Scope and setup

Set `PALABRA_API_KEY` securely on the server running Nanivio.
The Replit secret and the Render service environment are separate.
Never put this key in a `VITE_` variable, browser storage, a URL, or a chat message.
No new package, database migration, or client-side provider credential is needed.

The integrated call route handles both directions between English, French,
Spanish, Arabic, German, Italian, Portuguese, Chinese, Japanese, and Korean:
90 cross-language directions. This is configured coverage, not a claim that each
direction's speech quality has been verified. Same-language calls keep original audio.
Khaya/Sunbird specialist-language routes remain unchanged. Mixed specialist/
international routes still use the existing staged pipeline, including its Gemini
text-translation legs. Distinct Akuapem Twi is not silently mapped to generic Twi.

Malvi's Gemini voice and owned microphone engine are not changed. Standalone text
translation retains its separate provider path; a working call stream does not
verify text translation.
The administrator's readiness screen distinguishes the integrated live-call path
from these separate paths.

## Data flow

1. The owned browser capture sends actual microphone PCM16 mono at 16 kHz in
   320 ms chunks over Nanivio's authenticated WebSocket. Capture does not wait
   for silence, a complete utterance, a WAV upload or browser speech recognition.
2. `langpretation:start` creates a speaker-owned live session through the existing
   authenticated call connection. The bounded HTTP phrase endpoint remains for
   compatibility; the international call screen no longer uses it.
3. The server verifies a connected call participant, an active funded translation
   session, current account allowance, the language pair, and administrator settings.
4. One persistent server-to-Palabra WebSocket per speaker performs recognition,
   translation and synthesis. Wait for task acknowledgement and a receiving
   participant's playback-ready acknowledgement before sending microphone frames.
5. Incremental target-language PCM goes only to other connected call participants,
   not back to its speaker. The listener schedules each PCM chunk on a continuous,
   bounded Web Audio clock. Original Agora remote audio is muted while translated
   playback is active. No per-chunk TTS, Agora republishing or end-of-stream wait.
6. Stop, mute, call/language changes, or a lost browser request cancel queued
   capture and terminate the upstream connection. No audio is queued for reconnect.

The existing call meter owns the user's debit. The phrase endpoint must not debit
the same call again.

## Voice messages and selected languages

International voice messages use the integrated speech-to-speech provider rather
than the separate Gemini ASR/MT/TTS chain. Recordings are limited to sixty seconds,
validated as PCM16 mono WAV, and checked against the signed-in account's active
allowance before opening a provider session. The shared provider capacity limit,
request cancellation, bounded output, and idempotent recorded-input usage debit
also apply. Voice messages currently use a standard voice, not the call's
per-speaker cloning permission. Twi–English voice notes explicitly use Khaya for
both English/Twi speech ends and text translation; they do not depend on Gemini's
English speech stage. Other specialist routes retain their existing selection.
Staged voice-note errors identify recognition, translation or audio generation
without exposing provider names to the customer. Cancellation and bounded speech
response-body reads prevent further stages continuing after a request is stopped.

Language selection is a validated user preference, not an identity claim.
Authenticated presence broadcasts the selected language; contacts and call
participants are refreshed from it, and the accepting participant updates the
caller's copy. Profile persistence and verified chat membership refresh keep old
conversation snapshots from silently forcing the wrong target language.

The call's translation switch permits translation but is not proof that capture
is running. A visible Start translation control initiates microphone capture.
Listener readiness alone must never mute original call audio; actual playable
translated PCM is required.

## Speaker voice preservation

Nanivio's existing voice-profile types were definitions, not an operational saved
voice-cloning service. The call UI now asks the speaker to allow their own voice
to be used for this call's translation. Only that speaker's explicitly opted-in
session enables Palabra's `speech_generation.voice_cloning`.

Palabra documents this as experimental: adaptation normally needs 10–20 seconds
of speech. Initial audio can use a standard voice; this is not an instant exact
clone, an enrolled permanent voice, or a guarantee of speaker similarity across
all languages. Nanivio neither stores a voice reference nor creates a saved
provider voice profile through this flow. Upstream processing remains subject
to the provider's privacy/retention terms.

The two speakers have separate provider sessions, consent flags and stream IDs.
Consent is not carried across calls. Disabling permission stops the current
capture/session; restarting uses the newly chosen permission. Specialist paths
do not gain voice cloning from this change.

## Limits and failure behavior

- Continuous path: fixed 320 ms PCM16 mono frames, sequence and wall-clock rate
  checks, bounded socket buffers and at most six seconds of queued receiver audio.
- One provider stream/request per account and eight concurrent streams/requests per
  server process, shared with voice messages and the legacy phrase endpoint. These are not a
  distributed account-wide provider spending limit.
- Twelve-second setup/receiver-readiness deadline; seven-second upstream handshake;
  microphone delivery stalls close the stream; account/call authorization rechecks;
  a one-minute speech inactivity stop and ten-minute hard session limit.
- Legacy HTTP path: 16–48 kHz PCM WAV, 0.25–9 seconds, 25-second deadline and bounded
  output. It requires complete source/target text, correct-language audio and a
  clean end-of-stream. Continuous output instead arrives before end-of-stream.
- No automatic retries or silent provider fallback.
- Upstream credentials and raw provider error descriptions are never returned.
- No paid metadata calls or trial-balance assumptions. Speaker voice adaptation is
  enabled only when explicitly selected by the speaker.

The gateway streams while the person talks, but the provider still requires enough
linguistic context to translate. Continuous transport is not a promise of zero
delay or sub-second translation. Measure real target devices before such claims.

## Verification and remaining acceptance

Mocked automated checks exercise the actual provider bridge, routing, readiness,
audio validation, error sanitation, cleanup, acknowledgement, pacing and concurrency.
Additional live-path checks exercise PCM capture before silence, ordered chunks,
incremental receiver playback, two speaker-isolated sessions, consent-controlled
voice adaptation, stalled capture, authorization revocation and call cleanup.
They make no provider requests.

The previously authorized, non-cloning English/French diagnostic demonstrated real provider
recognition, translation and output audio in both directions. It was not a
two-person browser call. A separate approved two-account call on the target
devices is still needed to verify microphone capture, remote playback, subtitles,
call billing and speech quality together. Do not run paid tests without approval.

References: Palabra's [settings reference](https://docs.palabra.ai/docs/streaming_api/translation_settings_breakdown)
documents experimental voice cloning and its 10–20 second adaptation period.
