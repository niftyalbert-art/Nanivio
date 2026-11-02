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
