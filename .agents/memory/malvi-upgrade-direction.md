---
name: Malvi upgrade direction
description: User-selected direction for the Malvi response, visual, and brain upgrade.
---
The user intends changes to Malvi's responses, visuals, and brain, and specified “Heygen lite mode.”

**Why:** The user stated this product direction for the upcoming Malvi upgrade.

**How to apply:** Preserve this direction when scoping the upgrade. The user subsequently supplied the hybrid architecture described below.

Malvi uses the supplied Nanivio signature portraits as her identity. Live visuals must use HeyGen LiveAvatar LITE/WebRTC, not photo puppetry. Nanivio independently owns the backend reasoning and voice pipeline.

**Why:** The user explicitly chose “Rent the Face” / “Own the Brain” and asked to implement the visual layer before continuing with the brain.

**How to apply:** Keep rendering separate from reasoning, tools, and TTS. Do not substitute a public/sample avatar for the custom Malvi identity or present a static poster as a live stream.

Wake-word detection for “Nanivio” must remain strictly on-device. No provider audio/video or session initialization while idle. Sessions must close after 60 seconds without user input, with a Redis-backed limit of 10 initializations per hour and an AI disclosure in the first spoken greeting.

**Why:** These are the user's explicit privacy and cost-protection requirements.

**How to apply:** Never silently fall back to cloud wake recognition. Where verified local recognition is unavailable, disclose that limitation and require manual activation.

Treat SDK microphone settings as a privacy boundary, not just an audio setting.

**Why:** The official SDK's default-muted voice component still acquires and publishes a microphone. Muting alone does not satisfy independently owned input capture.

**How to apply:** Recheck capture behavior when updating the SDK; the renderer must not publish the user's microphone to the provider-managed voice component.

Use the LiveAvatar image-avatar creation route when preparing Malvi from the supplied still portraits; do not insist on training video as the only option.

**Why:** The user supplied still images, and the official LiveAvatar documentation confirms photo-based custom avatars support LITE with independently supplied audio. Ordinary HeyGen video avatars are not interchangeable with LiveAvatar assets.

**How to apply:** Verify current source-image requirements and paid avatar-slot availability before provisioning. Do not claim that bundled app images alone create a provider avatar, or that enlarging a low-resolution portrait guarantees acceptance.
