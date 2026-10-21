---
name: Malvi upgrade direction
description: User-selected direction for the Malvi response, visual, and brain upgrade.
---
The user intends changes to Malvi's responses, visuals, and brain, and specified “Heygen lite mode.”

**Why:** The user stated this product direction for the upcoming Malvi upgrade.

**How to apply:** Preserve this direction when scoping the upgrade. The user subsequently supplied the hybrid architecture described below.

Malvi uses the supplied Nanivio signature portraits as her identity. Preserve the HeyGen LiveAvatar LITE/WebRTC integration while developing a separate Nanivio-owned avatar engine. Nanivio independently owns the backend reasoning and voice pipeline.

**Why:** The user originally chose “Rent the Face” / “Own the Brain” and subsequently approved keeping HeyGen while continuing development of an independent engine.

**How to apply:** Keep rendering separate from reasoning, tools, and TTS. Develop the independent engine separately rather than replacing the HeyGen path before measured quality and latency tests. Do not substitute a public/sample avatar for the custom Malvi identity or present a static poster as a live stream.

Wake-word activation should recognise Malvi by name as well as retain “Nanivio”, and must remain opt-in and strictly on-device. No provider audio/video or session initialization while idle. Sessions must close after 60 seconds without user input, with a Redis-backed limit of 10 initializations per hour and an AI disclosure in the first spoken greeting.

**Why:** These are the user's explicit privacy and cost-protection requirements; the user subsequently requested activation by mentioning Malvi’s name.

**How to apply:** Never silently fall back to cloud wake recognition. Where verified local recognition is unavailable, disclose that limitation and require manual activation.

Malvi should follow the user’s selected Nanivio app language, including the first spoken AI greeting, without changing call-translation preferences. Preserve distinct dialect identities and disclose unverified speech coverage instead of promising every language works.

**Why:** The user requested preferred-language speech and name-based wake activation together. A language appearing in the app selector or provider documentation does not establish real spoken quality.

**How to apply:** Carry the selected language into the live brain and apply explicit preference changes without silently changing providers, substituting English, or opening another avatar session. Keep live-provider and real-device verification separate from fixture tests.

Keep Malvi’s live subtitles and feedback messages at the bottom and remove the full AI-disclosure descriptions from over her image.

**Why:** The user said the subtitles and full disclosure were covering her image, then reiterated that feedback messages must also be repositioned to leave her full image visible.

**How to apply:** Keep subtitles and feedback compact and bottom-aligned in every session state, including connection errors. Do not restore central message cards or a large disclosure paragraph over the avatar.

Subtitles must follow played speech, not the arrival of brain-generated text. Microphone feedback must distinguish local audio capture from speech actually recognized by the brain.

**Why:** The user confirmed Malvi can speak on Render, but reported that subtitles finished before she started talking and that microphone activation gave no visible listening feedback.

**How to apply:** Preserve playback-gated, voice-timed subtitles and truthful input feedback when changing providers or rendering paths. Do not use a cosmetic typing effect or simulated microphone activity as evidence of synchronization or listening.

Treat SDK microphone settings as a privacy boundary, not just an audio setting.

**Why:** The official SDK's default-muted voice component still acquires and publishes a microphone. Muting alone does not satisfy independently owned input capture.

**How to apply:** Recheck capture behavior when updating the SDK; the renderer must not publish the user's microphone to the provider-managed voice component.

Malvi’s speaking voice should match the user-supplied ElevenLabs recording across users’ selected languages. The standard Gemini test voice is not her approved final voice. The user confirmed that the original voice is saved in their ElevenLabs account and approved the generated short voice sample for Malvi.

**Why:** The user identified the supplied recording as Malvi’s voice and requested that identity in every selected user language.

**How to apply:** Resolve the original usable voice and verify its multilingual coverage before changing live speech. Do not promise unsupported languages, silently substitute a different voice, or treat an uploaded MP3 as an already-configured synthesis voice.

Use the LiveAvatar image-avatar creation route when preparing Malvi from the supplied still portraits; do not insist on training video as the only option.

**Why:** The user supplied still images, and the official LiveAvatar documentation confirms photo-based custom avatars support LITE with independently supplied audio. Ordinary HeyGen video avatars are not interchangeable with LiveAvatar assets.

**How to apply:** Verify current source-image requirements and paid avatar-slot availability before provisioning. Do not claim that bundled app images alone create a provider avatar, or that enlarging a low-resolution portrait guarantees acceptance.
