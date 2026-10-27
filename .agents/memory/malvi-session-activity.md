---
name: Malvi session activity
description: Count both sides of a conversation without keeping unattended paid sessions alive.
---
Treat a server-confirmed spoken reply as active conversation, including its
bounded playback duration, not only the user's microphone loudness.
Provider-recognized user speech can confirm activity when the PCM loudness
threshold misses quiet speech. Silence and empty transcripts cannot.

**Why:** The user reported interruptions at about one minute despite stable
internet. Input-only expiry can end a session while the user listens to Malvi
or while quiet speech is being recognized.

**How to apply:** Keep Redis, the server's idle timer, and the browser's displayed
deadline consistent. Concurrent input/output updates must never shorten an
already-confirmed playback window. Preserve ownership, the hard session cap,
and expiry of unattended sessions; never revive expired sessions or add a
client-controlled keepalive that can run paid sessions indefinitely.
