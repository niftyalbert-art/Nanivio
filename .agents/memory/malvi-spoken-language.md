---
name: Malvi spoken language
description: Session-local language switching and shared two-person interpretation
---
Malvi should accept explicit spoken requests to switch to an available conversation language without changing the account or app language. She can interpret between two friends using two confirmed languages, one speaker at a time.

**Why:** The user wants Malvi to help friends who do not understand each other's languages. This is a conversation preference, not permission to change the entire app. Shared interpretation can include another person's private speech, so it must not silently become the account owner's personal saved history.

**How to apply:** Validate the target against registered languages and the session's selected voice provider. Reject unavailable languages clearly rather than substituting English or switching providers. Carry the confirmed spoken language through playback and captions without reconnecting or resetting allowances or timers. Interpretation translates participants' statements rather than answering translated questions as addressed to Malvi. Keep shared interpretation out of private account memory and do not reveal account history in that mode. Do not promise simultaneous speech or verified speaker identification. Automated adapter checks do not establish real pronunciation or interpretation accuracy.
