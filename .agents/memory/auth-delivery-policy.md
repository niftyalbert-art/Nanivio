---
name: Authentication delivery providers
description: User-specified provider responsibilities for signup verification and password recovery.
---

Signup user mobile-number verification requires an international provider: the user stated, “Nanivio Is global App not only in Ghana.” The user reports the Twilio account is suspended and encountered problems with Prelude. The user subsequently requested replacing Infobip as well and asked for a different global provider recommendation; do not assume Infobip is their chosen provider or request its credentials again. Use Resend for “Forgot password” reset verification.

**Why:** The user explicitly specified the authentication responsibilities, clarified that Nanivio needs global coverage, and said “change the infobip provider.”

**How to apply:** Do not choose a Ghana-only signup verification solution. Confirm destination coverage and pricing for the selected international provider. Keep signup phone verification and password-reset email delivery separate. Require provider-backed verification rather than treating a client checkbox or an unsent code as successful verification. These are authentication flows, not purchased SMS or calling allowances.

For signup phone verification, technical provider errors should appear only in protected administrator diagnostics and server logs. Signup users should receive a simple retry message.

**Why:** The user explicitly approved keeping technical details away from signup users and requested that the same diagnostics appear in the admin dashboard.

**How to apply:** Preserve the public/admin separation when changing error handling. Never include API keys, phone numbers, verification codes or raw provider response bodies in the diagnostic feed.
