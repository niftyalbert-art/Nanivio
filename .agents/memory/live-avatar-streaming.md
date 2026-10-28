---
name: Live avatar streaming utterances
description: Preserve one render utterance across native voice packets and verify protocol changes against real returned media.
---
Do not use SDK repeatAudio separately for every native voice packet: the installed SDK seals an utterance on each call. Keep streamed packets in one utterance until the brain finishes its reply.

**Why:** A live probe accepted fifteen PCM packets as one speaking lifecycle when the utterance was sealed only at reply completion. Restarting speaking per small packet can interrupt animation continuity; successful delivery alone does not prove phoneme-level lip synchronization.

**How to apply:** Verify the installed SDK's behavior on upgrades. Use the existing protected LITE socket extension rather than patching private fields or opening a competing connection. Keep base64 chunks aligned to PCM samples, preserve interruption cancellation and caption continuity, and keep audio on the returned paired A/V element. Provider events measure processing, not exact browser playout; never claim perfect lip sync from event counts or a recorded capture alone.
