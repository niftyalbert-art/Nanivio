---
name: Malvi microphone verification
description: Evidence boundaries for actual audio capture versus simulated microphone controls.
---
Verify microphone-processing changes in a real browser audio-rendering thread,
using synthetic Web Audio input when a physical microphone is unavailable.
Simulating AudioWorkletNode only verifies the surrounding UI and routing.

**Why:** A live listening failure persisted despite passing UI fixtures because
the real processor crashed in AudioWorkletGlobalScope. Window-thread globals
are not necessarily available in a worklet, and an active media track is not
proof that PCM frames are produced.

**How to apply:** Keep audio-thread processing independent of window-only APIs.
Check actual frame production, encoding, transport, stop/late-message handling,
and provider input contracts separately. Capture and meter activity do not prove
that a live provider understood the speech; reserve that claim for a real,
authorized recognition test on the intended device.
