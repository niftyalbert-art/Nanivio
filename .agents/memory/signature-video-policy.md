---
name: Nanivio authentication signature
description: User's standing rules for when the branded signature appears and its sound/controls.
---
The signature is shown only after a successful sign-in or sign-up, never when opening the app, entering its URL, or restoring an existing session. The user called it the "Nanivio signature": sound must be on, and there must be no skip or sound/mute options.

**Why:** The user explicitly requested this behavior, distinguishing the authentication signature from a startup introduction.

**How to apply:** Do not reintroduce a startup intro or silently muted autoplay fallback. Request audible playback; if the browser blocks it, obtain a play gesture without offering a mute/skip preference. Browser/system audio restrictions cannot be overridden by the app.

Prepare the media while a user is entering sign-in/sign-up, so successful
authentication does not begin a fresh, avoidable loading delay.

**Why:** The owner explicitly requested that the signature respond immediately
after successful authentication. Preparation is not permission for early playback.

**How to apply:** Preloading is allowed, but actual playback remains gated by
verified, explicit sign-in/sign-up success. Preserve the sound and gesture rules
above; do not play on session restoration or before authentication.
