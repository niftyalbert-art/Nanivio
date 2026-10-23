# Malvi voice selection

Malvi’s setup panel offers two explicit choices before a session starts:

- **ElevenLabs:** the approved custom voice, existing credit usage and provider
  character timestamps. This remains the default.
- **Gemini:** the selected Gemini Live brain’s built-in `Kore` voice. This is a
  different voice, not a clone or export of the ElevenLabs voice. It uses no
  ElevenLabs synthesis requests, but Gemini usage limits/charges and LiveAvatar
  costs still apply.

The choice is stored in the owned Redis session, not accepted from WebSocket
audio payloads. It is fixed until that session ends. Gemini voice requires the
Gemini brain; choosing it with OpenAI fails explicitly, without starting a second
brain or falling back. Nanivio Mic, user activation, session deadlines and
ownership checks are unchanged.

## Setup and rollout

No additional credentials are required for Gemini voice when `GEMINI_API_KEY`
and `MALVI_BRAIN_PROVIDER=gemini` are already configured. After deploying this
update, close any active session, select **Gemini · alternative voice**, and
start a fresh session.

Optionally set `MALVI_VOICE_PROVIDER=gemini` to make Gemini the server default.
Omit it or use `elevenlabs` to retain the existing default. This is independent
of `MALVI_TTS_TRANSPORT`, which controls only the ElevenLabs connection.
Never replace `GEMINI_API_KEY` with the word `gemini`.

Readiness reports configuration, not successful inference or remaining quota.
Unsupported language identifiers are refused without silently substituting a
dialect or English. The catalogue does not establish pronunciation quality.

## Playback and limitations

Gemini native PCM16 mono at 24 kHz passes through the existing LITE
`repeatAudio` path. It is never played separately alongside the avatar audio.
Native chunks are bounded and buffered until turn completion to keep one audio
packet paired with its transcript; this can add delay for long answers.
Interruption, language changes and session end discard buffered output. Limits
apply to each turn and session, including discarded generated audio.

Gemini Live does not provide the character-level timestamps used by ElevenLabs.
Native captions are explicitly marked **Approximate captions**. Their estimated
pacing is anchored to actual media playback, not early transcript arrival.
Neither this estimate nor successful format checks prove phoneme/lip alignment.
Do not claim exact subtitle or lip synchronization.

Verification uses isolated provider contracts, authenticated route fixtures,
actual browser UI fixtures and build checks, without paid provider calls.
Live Gemini availability, physical-phone lip-sync, actual voice quality and
pronunciation require a separately approved live test.
