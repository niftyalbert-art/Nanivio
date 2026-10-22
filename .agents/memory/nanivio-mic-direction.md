---
name: Nanivio Mic direction
description: The user's requirement for a dedicated Nanivio-owned voice engine across browsers, cloud, and apps.
---
The user wants Nanivio Mic to use a dedicated own-built engine, rather than being
built on the browser's speech engine, accessible across browsers and Nanivio's
own cloud/app.

**Why:** The user explicitly requested this direction after the Malvi microphone
failure.

**How to apply:** Separate Nanivio's shared voice engine from platform-specific
microphone capture. Web access still needs browser permission; a native app uses
the operating system's capture APIs. Do not equate engine ownership with
training a proprietary speech model, self-hosting recognition, or consent to
always-on cloud listening. Clarify these choices before replacing providers or
creating a separate app. Preserve the approved voice and selected brain unless
the user changes those decisions.
