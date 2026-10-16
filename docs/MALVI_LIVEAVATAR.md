# Malvi: LiveAvatar LITE visual foundation

This phase implements the custom identity, video session lifecycle, local-only
wake-word boundary, and cost controls. It deliberately does **not** implement
the new conversational brain. A still portrait is never presented as live video.

## Repository structure

```text
server.ts                           registers authenticated assistant routes
src/App.tsx                         mounts the live-session provider after sign-in
src/lib/
  malviIdentity.ts                   bundled imports of both supplied portraits
  malviLiveClient.ts                 authenticated API client and PCM-only audio bridge
  localMalviWakeWord.ts              on-device-only "Nanivio" activation
src/components/malvi/
  MalviView.tsx                      existing companion and new launch controls
  MalviLiveAssistant.tsx             SDK lifecycle, wake activation, client idle timer
  MalviLiveOverlay.tsx               full-screen real video, disclosure, end/interrupt
  MalviAvatar.tsx                    shared angled-portrait identity
  MalviLivingMotionAvatar.tsx        static frontal preview; no face puppetry
  MalviStage3DVisual.tsx             portrait stage (legacy filename retained)
  MalviFloatingWidget.tsx            navigation launcher, not a scripted assistant
src/server/assistant/
  routes.ts                         authentication, setup checks, HTTP contracts
  liveAvatarService.ts               provider exchange, ownership, session sweeper
  redisStore.ts                      atomic rate limit, active lease, shared deadlines
  pcm.ts                            backend WAV -> PCM16 mono 24 kHz conversion
tests/assistant-live.test.ts         actual Redis + lifecycle/audio/wake regressions
scripts/live-call-checks/
  malvi-avatar.mjs                   actual React UI with isolated SDK/HTTP fixtures
attached_assets/
  malve_anota_new_face_1792153689549.png
  malvi_new_image_1792153689550.png
```

## Setup required before real video can run

- `HEYGEN_API_KEY`: a **LiveAvatar API key**, not a generic video-generation key.
  Keep it in server-side secrets only.
- `AVATAR_ID`: the ID of the provisioned custom Malvi asset in LiveAvatar.
  These supplied PNGs are the app's identity/poster; simply uploading an image
  into this repository does not train or provision a provider avatar. Do not
  substitute a public/sample face.
- LiveAvatar supports creating a custom **image avatar** from a single PNG/JPEG;
  a two-minute recording is not mandatory for that route. Create it in the
  LiveAvatar platform, not the separate HeyGen video-avatar product. Custom
  creation requires an available paid LiveAvatar avatar slot.
  The provider's current image guide requires minimum 1080p and a 9:16 or 16:9
  aspect ratio. Prefer a clear, front-facing, neutral-mouth chest-up portrait.
  The supplied originals are only 247x331 and 242x332; use a higher-resolution
  source or explicitly approved enhancement before provider upload. Upscaling
  alone does not recover missing detail or guarantee acceptance.
  See https://help.heygen.com/en/articles/9612935-liveavatar-custom-avatar-creation-guide
  and https://docs.liveavatar.com/docs/core-concepts/avatars.
- `REDIS_URL`: a shared Redis service reachable by every application instance.
  Use a private or TLS-protected connection and keep credentials in secrets.
- `NANIVIO_MALVI_ENABLED=false` explicitly disables the assistant. Administrators
  can also disable the Malvi feature switch.
- The optional first spoken welcome uses the existing backend English TTS route
  (`AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` configuration). If it is not
  configured or returns invalid audio, the visual session displays that fact;
  it does not use browser TTS or provider-owned voice as a fallback.

No new wallet charges or paid-plan minute settlement are implemented by this
visual phase. Before charging for live-avatar time, connect the authoritative
Malvi entitlement and usage ledger to the server-owned live session clock.

## Connection protocol

```text
Idle: local portrait; no LiveAvatar token request, SDK start, remote mic, or video
  -> explicit Start OR verified on-device "Nanivio"
  -> POST /api/assistant/session (existing authenticated Nanivio account)
  -> atomic Redis 10/hour sliding window + one-active-session reservation
  -> POST https://api.liveavatar.com/v1/sessions/token
     {mode:"LITE", avatar_id, video_settings:{quality:"high",encoding:"H264"},
      max_session_duration:600}
  -> ephemeral session token to frontend; API key remains on backend
  -> official @heygen/liveavatar-web-sdk starts and attaches real media
  -> full-screen overlay, idle deadline, visible AI disclosure
  -> optional backend welcome PCM -> SDK repeatAudio -> avatar lip-sync
  -> close / 60s without user input / disconnect / hard duration cap
  -> SDK.stop() and backend provider stop; Redis ownership released
```

The prompt's lowercase `lite`, website URL, returned SDP offer, and
`.endSession()` are conceptual, not the current official API contract.
The actual provider mode is uppercase `LITE`, the API origin is
`https://api.liveavatar.com`, and SDK `start()` manages the underlying
LiveKit/WebRTC negotiation. Do not fabricate an SDP response.

The SDK's default-muted voice component still opens/publishes a microphone.
This renderer disables its `voiceChat.start` before session start. Our future
brain owns audio input; no user microphone is published to HeyGen by this phase.

## HTTP surface

All routes require the existing authenticated account; all responses are no-store.

| Route | Purpose |
|---|---|
| `GET /api/assistant/status` | Configuration presence only, never secret values |
| `POST /api/assistant/session` | `{activation:"manual"|"wake-word"}` |
| `POST /api/assistant/session/:id/activity` | Explicit `{kind:"input"|"interrupt"}` |
| `POST /api/assistant/session/:id/welcome` | Fixed AI-disclosure welcome, once/session |
| `POST /api/assistant/session/:id/end` | Owner-only, idempotent stop |

Client activation is not an authentication proof. Identity always comes from the
existing server authentication middleware, never from a request body.

## Idle and cost protection

- **60 seconds** without explicit user input ends the client session. Rendered
  video frames, assistant speech, polling, and page visibility do not reset it.
- Shared Redis stores the same deadline. A server sweeper independently stops
  overdue provider sessions even if the tab disappears or its timer is throttled.
- Stop claims are atomic across instances; failures remain due and are retried.
- **10 starts per rolling hour per account**, including failed provider attempts.
  Parallel requests cannot bypass the limiter. Only one active lease per account.
- Redis missing/unavailable: fail closed before provider initialization.
- Provider-enforced **10-minute hard session cap** bounds costs if every app
  instance fails. This is an additional safety ceiling, not a replacement for
  the 60-second user-inactivity deadline.
- No automatic reconnect or background provider keepalive.
- Configuration and API errors never expose provider payloads or credentials.

## Local wake word

Opt-in, after a user gesture. Requires `SpeechRecognition.processLocally` and an
already installed English speech pack. Recognition explicitly sets local mode.
Unsupported browsers show a manual-start option instead of silently switching
to `webkitSpeechRecognition` or remote ASR. Listening stops after a match,
logout, navigation teardown, microphone error, or explicit stop.

## Next phase: independently owned brain

Add the authenticated, low-latency STT/LLM/TTS pipeline on the backend, with
account-scoped memory, server-validated tool calls, and permission checks.
Only backend-produced PCM16 mono 24kHz audio goes to the LITE renderer. Do not
use SDK `message()` or `repeat()` (provider-owned reasoning/TTS).
The first spoken welcome is fixed to:

> Hello, I'm Malvi, Nanivio's interactive AI assistant, not a human.

This is an AI transparency disclosure, not a guarantee of legal compliance.
Obtain jurisdiction-specific legal review if required.

## Verification

```sh
npm run lint
node --import tsx --test tests/*.test.ts
npm run build
node scripts/live-call-checks/malvi-avatar.mjs
```

The Redis regression starts its own disposable local `redis-server` without
persistence. Install that executable to run it; otherwise it is explicitly
skipped. Browser fixtures mock SDK/HTTP and never charge a provider or bypass
the real application's sign-in. They do not establish live avatar quality,
custom identity correctness on the provider, or signed-in deployment readiness.

Official reference:
- https://docs.liveavatar.com/docs/lite-mode/configuration
- https://docs.liveavatar.com/docs/lite-mode/lifecycle
- https://docs.liveavatar.com/api-reference/sessions/create-session-token
- https://github.com/heygen-com/liveavatar-web-sdk
