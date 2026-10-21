# Malvi's approved ElevenLabs voice

Malvi keeps the selected Gemini Live or OpenAI GPT-Live brain and the custom
LiveAvatar **LITE** renderer. ElevenLabs is a speech service, not an ElevenLabs
conversational Agent. No LiveAvatar dashboard voice agent is required.

The user approved the short sample generated with voice
`kW71iH6myeMHEvxKthQ6`, model `eleven_multilingual_v2`, stability 0.5,
similarity 0.75, speaker boost on and speed 1. These settings are used for live
speech. The reference recording is not uploaded, cloned, or used as a fallback.

## Render setup

Set these in the **web service's** environment and deploy the updated code:

```text
MALVI_TTS_TRANSPORT=direct
ELEVENLABS_API_KEY=<enter the actual key privately in Render>
ELEVENLABS_VOICE_ID=kW71iH6myeMHEvxKthQ6
MALVI_BRAIN_PROVIDER=gemini
```

Keep the existing Gemini, LiveAvatar and Redis configuration. Keep the
ElevenLabs key restricted to the permissions needed for Text to Speech, with a
credit limit. `voices_read` is not required: this path uses the known voice ID
and never lists voices. Replit connector credentials are not copied to Render.
On Replit, `MALVI_TTS_TRANSPORT=connector` uses the existing integration through
a fresh SDK client. A request uses one transport, without failure fallback.

## Output and privacy

Gemini's native-audio model still requires AUDIO modality and generates its own
audio internally. That audio is discarded. Only its output transcription is
synthesized by ElevenLabs after turn completion. Gemini charges still apply;
ElevenLabs synthesis adds usage. OpenAI GPT-Live's transcript API has no
transcript-done event: its adapter collects fragments until a 700 ms quiet gap,
then queues bounded speech segments serially. This is not a verified complete
OpenAI response boundary or a live latency benchmark.

The user's microphone goes only to the selected brain, not ElevenLabs or
LiveAvatar. Response text goes to ElevenLabs. Only validated raw PCM16LE,
24 kHz mono audio reaches the renderer or voice-only playback. The UI discloses
this speech processing. Credentials and provider error bodies are never returned.
Provider retention remains governed by the provider/account settings; this
integration does not claim zero retention.

Interruption, detected user speech, language changes and disconnect abort
pending synthesis and invalidate late output. Aborting cannot guarantee that a
provider reverses charges for an already accepted request. There are no
application-level retries; the connector SDK may refresh authentication after
a rejected 401. Speech does not extend the user-input idle deadline.

Per-session limits are 1,200 characters per segment, 6,000 attempted characters,
30 attempted segments and at most three pending segments. Output is bounded at
3 MB and a 15-second provider timeout. Existing Redis initialization and session
deadlines remain. These safeguards are not an account-wide billing ledger.

## Language limits

This preserves the approved tested model, not a promise of all Nanivio languages.
Supported model language codes are advertised in
https://elevenlabs.io/docs/overview/models#multilingual-v2.
Unsupported languages (including distinct Twi dialects, Luganda and Ga) are
rejected explicitly before session creation or speech spending. No mapping to
English, related dialects, browser TTS, Gemini's native voice or another provider.
The rest of Nanivio's language selection and call-translation settings remain
unchanged. Broader coverage needs a separately validated model/voice route.

The approved sample verifies English voice access, not multilingual accuracy,
live lip-sync, microphone barge-in or a deployed Render conversation. Automated
tests use isolated provider responses and do not spend credits.

## Checks

```sh
node --import tsx --test tests/malvi-speech.test.ts tests/malvi-live-brain.test.ts tests/malvi-language-wake.test.ts tests/assistant-live.test.ts
node tests/malvi-brain-language-adapters.mjs
npm run lint -- --pretty false
npm run build
```
