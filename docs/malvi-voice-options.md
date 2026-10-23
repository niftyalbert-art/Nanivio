# Malvi voice selection

Only administrators can set Malvi’s voice in the Malvi setup panel. This global
policy applies to all new sessions, not just the administrator’s session.
Ordinary users have no voice selector and cannot override the provider through
session requests. Administrators have two choices:

- **ElevenLabs:** the approved custom voice, existing credit usage and provider
  character timestamps. This remains the default.
- **Gemini:** the selected Gemini Live brain’s built-in `Sulafat` voice with
  the user-approved warm, fuller Malvi direction, a light British–Ghanaian
  English blend, and gentle ambience/echo. This is a
  different voice, not a clone or export of the ElevenLabs voice. It uses no
  ElevenLabs synthesis requests, but Gemini usage limits/charges and LiveAvatar
  costs still apply.

The administrator’s policy is saved in shared Redis without a session TTL.
It survives application restarts and is read across server instances. Each new
owned Redis session saves that selected provider; existing sessions are not
changed mid-conversation. No choice is accepted from session or WebSocket audio
payloads. Gemini voice requires the
Gemini brain; choosing it with OpenAI fails explicitly, without starting a second
brain or falling back. Nanivio Mic, user activation, session deadlines and
ownership checks are unchanged.

## Setup and rollout

No additional credentials are required for Gemini voice when `GEMINI_API_KEY`
and `MALVI_BRAIN_PROVIDER=gemini` are already configured. After deploying this
update, sign in as an administrator, close any active session, and select
**Gemini · Sulafat · approved Malvi style** in the Malvi setup panel.
The saved confirmation applies to everyone’s new sessions. Start a fresh session.

`MALVI_VOICE_PROVIDER=gemini` is the initial server default only when no
administrator policy has been saved. Omit it or use `elevenlabs` for the
initial ElevenLabs default. A saved administrator choice takes precedence.
Redis failures fail closed rather than silently choosing another billable voice.
This is independent
of `MALVI_TTS_TRANSPORT`, which controls only the ElevenLabs connection.
Never replace `GEMINI_API_KEY` with the word `gemini`.

Readiness reports configuration, not successful inference or remaining quota.
Unsupported language identifiers are refused without silently substituting a
dialect or English. The catalogue does not establish pronunciation quality.

## Playback and limitations

Gemini native PCM16 mono at 24 kHz passes through the existing LITE
`repeatAudio` path. It is never played separately alongside the avatar audio.
The bounded effects processor runs on the server before delivery: rumble
filtering and short, low-level room reflections use the same settings as the
approved sample. Peak attenuation prevents clipping without adding leading
look-ahead delay or requiring ffmpeg in production. Each response has fresh
effect state, so interruption cannot leave a separate echo source playing.
Voice-only playback receives the same processed PCM.

The audio packet includes both total duration and pre-reflection speech
duration. Estimated captions pace over the speech, not the extra echo tail;
avatar/playback accounting includes the complete tail.

English speech direction includes “Na ni vio” pronunciation guidance, a fuller
tone and the selected accent blend. Other app languages keep their own
pronunciation instead of forcing English phonology or changing to English.
Direction is not a voice clone, and generated accent/timbre/pronunciation can
vary. Approval of an English sample does not verify every language or future
utterance. ElevenLabs voice settings and speech audio are unaffected.

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
