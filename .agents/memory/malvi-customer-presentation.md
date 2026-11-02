---
name: Malvi customer presentation
description: User-requested branding, concise help, and varied greetings.
---
Customer-facing Malvi screens should use Nanivio branding rather than advertise
implementation providers. Use “Nanivio map” for navigation controls, while
making external handoff clear and preserving required attribution and real citations.
Keep language/wake help to one or two short sentences.

**Why:** The owner explicitly requested removal of provider names and long setup
descriptions from the ordinary user experience.

**How to apply:** Keep actionable failures visible and technical details available
to administrators. Never imply Nanivio owns third-party services or hide applicable
privacy information. Do not rename actual research citations to Nanivio.

Greetings should vary naturally rather than recite one fixed script.

**Why:** The owner requested different welcoming messages.

**How to apply:** Keep identity consistent, use the selected conversation language,
and offer returning users continuation or a new topic without repeating introductions.

Malvi should explain Nanivio's actual features and published billing clearly.
An unsuccessful chat request must not insert or speak a canned substitute as
though the configured brain answered the user.

**Why:** The owner requested app-wide feature and billing knowledge and reported
that the static conversation felt fake and did not respond properly.

**How to apply:** Use authoritative current product information and published
prices. Do not treat client-supplied conversation context as verified balances
or payment proof. Preserve an unsuccessful message for an honest retry, rather
than saving a fabricated answer into the conversation.

Video-call screens should keep faces visible rather than cover the foreground
with explanatory paragraphs.

**Why:** The owner reported too much writing across the video-calling interface.

**How to apply:** Keep essential controls, captions, consent and actionable
errors available. Put optional explanations and diagnostics behind disclosure
controls rather than removing necessary safety information.

Mobile conversation subtitles must remain visible independently of optional call
controls, including both the user's recognized speech and Malvi's reply.
Subtitles must not cover Malvi's face on phones, tablets or computers.

**Why:** The owner repeatedly reported hidden subtitles on mobile after an
isolated transcript test passed; a readable component alone did not establish
that the full overlay kept it on screen.
The owner also repeatedly reported that readable subtitles were covering her face.
A transcript rectangle can be inside the viewport while a smaller ancestor
clips its text; viewport bounds alone are not a visibility check.

**How to apply:** Verify the complete overlay with long text, expanded optional
panels, small portrait screens and landscape. Check screen-resize auto-follow
as well as intentional scrolling back through earlier text. Do not substitute
desktop or standalone transcript checks for the mobile overlay.
Reserve separate media and transcript/control regions; verify their actual
non-overlap and ancestor clipping, not only whether the subtitle text fits
inside the viewport.

Keep Malvi's avatar and conversation layout steady throughout live speech.
The owner reported a small avatar and the whole image/chat appearing to vibrate.

**Why:** Resizing the media region as captions appear, disappear or change
speaker makes the entire conversation seem unstable. A wider media region can
still make a contained portrait smaller if its available height is reduced.

**How to apply:** Check empty, single-speaker and both-speaker captions, streaming
updates and microphone indicators without changing media geometry. Compare the
actual contained portrait footprint across tablet breakpoints, not stage width
alone; preserve the full face and separate subtitle area.
