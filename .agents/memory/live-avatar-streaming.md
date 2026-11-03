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

**Why:** The installed package's per-class JavaScript did not await a keep-alive
request, but its exported ESM and CJS bundles did. Inspecting the unused file
alone would falsely establish an unhandled-rejection bug.

**How to apply:** Resolve the loaded entry point and inspect that implementation
before proposing SDK workarounds or private-field patches.
