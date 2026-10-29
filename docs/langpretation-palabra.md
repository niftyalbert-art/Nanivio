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
translation and voice-note processing also retain their existing provider paths.
The administrator's readiness screen distinguishes the integrated live-call path
from these separate paths.

## Data flow

1. The existing owned browser recorder captures actual microphone PCM WAV and
   detects phrase boundaries. It does not use browser speech recognition.
2. For an international pair, send the WAV to the authenticated
   `/api/langpretation/call/translate-audio` endpoint, not the separate ASR endpoint.
3. The server verifies a connected call participant, an active funded translation
   session, current account allowance, the language pair, and administrator settings.
4. One server-to-Palabra WebSocket performs recognition, translation, and synthesis.
   Audio starts only after task acknowledgement and is paced in real time.
5. Complete target-language PCM becomes a WAV, decoded once by the browser and
   published to the remote participant through the existing Agora audio path.
   There is no second synthesis request or local duplicate voice playback.
6. Stop, mute, call/language changes, or a lost browser request cancel queued
   capture requests and terminate the upstream connection.

The existing call meter owns the user's debit. The phrase endpoint must not debit
the same call again.

## Limits and failure behavior

- PCM16 mono, 16–48 kHz, 0.25–9 seconds per input phrase. The browser normally
  cuts phrases at eight seconds.
- One in-flight phrase per account and eight concurrent requests per server
  process. These are not a distributed account-wide provider spending limit.
- 25-second upstream deadline, seven-second connection handshake, bounded response
  messages/output audio; no automatic retries or silent provider fallback.
- A success requires source text, translated text, correct-language audio, and a
  clean end-of-stream. An HTTP connection alone is not a successful translation.
- Upstream credentials and raw provider error descriptions are never returned.
- No extra provider voice cloning, paid metadata calls, or trial-balance assumptions.

This first bridge is phrase-based, not a continuous browser-to-provider stream.
Input pacing and provider processing add latency after phrase capture. It must not
be advertised as instant or sub-second.

## Verification and remaining acceptance

Mocked automated checks exercise the actual provider bridge, routing, readiness,
audio validation, error sanitation, cleanup, acknowledgement, pacing and concurrency.
Speech-service checks exercise delivery and stopped-session suppression.
They make no provider requests.

The previously authorized English/French diagnostic demonstrated real provider
recognition, translation and output audio in both directions. It was not a
two-person browser call. A separate approved two-account call on the target
devices is still needed to verify microphone capture, remote playback, subtitles,
call billing and speech quality together. Do not run paid tests without approval.
