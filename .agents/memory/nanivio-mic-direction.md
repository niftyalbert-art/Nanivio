---
name: Nanivio Mic direction
description: The user's requirement for a dedicated Nanivio-owned voice engine across browsers, cloud, and apps.
---
The user wants Nanivio Mic to use a dedicated own-built engine, rather than being
built on the browser's speech engine, accessible across browsers and Nanivio's
own cloud/app.

The user selected “Build the Nanivio engine with current AI providers” rather
than self-hosting speech recognition.

**Why:** The user explicitly requested this direction after the Malvi microphone
failure.

**How to apply:** Separate Nanivio's shared voice engine from platform-specific
microphone capture. Web access still needs browser permission; a native app uses
the operating system's capture APIs. Do not equate engine ownership with
training a proprietary speech model, self-hosting recognition, or consent to
always-on cloud listening. Retain current AI providers; ask separately before
replacing providers or creating a separate app. Preserve the approved voice and selected brain unless
the user changes those decisions.

Treat working conversational microphone input as a regression boundary while
developing the owned engine.

**Why:** The user confirmed that Malvi could hear and respond, and explicitly
asked that committing and pushing the owned-engine changes not break that
behavior. This confirmation does not establish which revision was deployed.

**How to apply:** Preserve the successful capture-to-response path and verify it
after deployment; do not treat a source push or local capture test as proof that
the live conversation still works.
