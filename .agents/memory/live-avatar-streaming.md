---
name: Live avatar streaming utterances
description: Preserve streamed utterances and distinguish returned media, decoded frames, and visible avatar presentation.
---
Do not use SDK repeatAudio separately for every native voice packet: the installed SDK seals an utterance on each call. Keep streamed packets in one utterance until the brain finishes its reply.

**Why:** A live probe accepted fifteen PCM packets as one speaking lifecycle when the utterance was sealed only at reply completion. Restarting speaking per small packet can interrupt animation continuity; successful delivery alone does not prove phoneme-level lip synchronization.

**How to apply:** Verify the installed SDK's behavior on upgrades. Use the existing protected LITE socket extension rather than patching private fields or opening a competing connection. Keep base64 chunks aligned to PCM samples, preserve interruption cancellation and caption continuity, and keep audio on the returned paired A/V element. Provider events measure processing, not exact browser playout; never claim perfect lip sync from event counts or a recorded capture alone.

`SESSION_STREAM_READY` establishes that audio/video tracks were subscribed, not
that the browser decoded a frame. The SDK startup promise can also finish before
that event. Neither alone establishes a playable live avatar.

**Why:** The owner reported text without avatar or sound even with a positive
LiveAvatar balance. A bounded renderer-only probe returned real frames and
non-silent paired audio, distinguishing account availability from app/browser
startup. It did not reproduce or establish the cause on the user's Render device.

**How to apply:** Keep startup bounded through media readiness, require actual
video playout before reporting a connected avatar, and retain the paired A/V
audio path. Test never-arriving tracks, subscribed-but-frozen video, cancellation,
and both orders of SDK-start/frame readiness without automatically spending on
replacement sessions.

Give SDK network initialization and decoded-frame readiness separate bounded
deadlines; do not spend the frame budget on HTTP, WebRTC and control setup.

**Why:** A shared deadline reported a playback failure while the SDK was still
connecting, without identifying which connection stage had stalled.

**How to apply:** Keep startup cancellable, keep the microphone and queued
speech gated until both stages succeed, and never extend the server's allowance
or hard session deadline. Use only public SDK state for support codes.

Brain-start delivery must wait for the authenticated socket acknowledgement,
not merely an open WebSocket, and must be cancelled when its session changes.

**Why:** A one-shot retry can silently lose brain startup during a slow socket
handshake; sending before identity verification can also be discarded. Either
case can leave the avatar visible without its conversation.

**How to apply:** Retry only until the command is actually sent, keep retries
bounded and session-owned, and never replay microphone frames. After explicit
activation, overlap independent renderer loading and owned-session preparation;
optional caption monitoring must not block network startup.

Startup can accept an already-presented frame, but speech delivery must still
check fresh video progress.

**Why:** A video-frame callback waits for a future frame; observing an already
playing idle stream can otherwise reject video that the browser has already
presented. Conversely, old frames do not prove continued progress during speech.

**How to apply:** At startup require non-paused playback, current frame data,
nonzero dimensions and browser-reported presented (not dropped) frames, or a new
frame callback. Do not relax the separate per-audio delivery gate. Distinguish
sound-consent failures from decoder failures instead of hiding both as muted
playback.

Receiving and decoding video does not establish that the user can see it:
app-wide surface theming must not flatten translucent media overlays into
opaque backgrounds.

**Why:** A production stylesheet's broad dark-gradient surface rule matched
Malvi's full-screen shading and painted over the video while leaving speech and
transcripts available. The browser reproduced that opaque layer independently
of provider credits or account identity.

**How to apply:** Keep live-media shading outside broad card/surface theme
overrides. Verify computed transparency and actual screen presentation alongside
frame readiness; a valid stream, nonzero video dimensions, or an uncropped
bounding rectangle alone cannot detect video concealed by another layer.

Inspect the SDK's actual package exports before treating sibling source files
as runtime behavior.

**Why:** Previously, the package's per-class JavaScript and exported bundles
differed about awaiting keep-alive. That observation is version-specific;
inspecting an unused file or treating that historical behavior as current can
falsely establish an SDK bug.

**How to apply:** Resolve the loaded entry point and inspect that implementation
before proposing SDK workarounds or private-field patches.
