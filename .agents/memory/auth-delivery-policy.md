---
name: Authentication delivery providers
description: User-specified provider responsibilities for signup verification and password recovery.
---

Use Twilio for signup user mobile-number verification. Use Resend for “Forgot password” reset verification.

**Why:** The user explicitly specified these responsibilities and said, “Don't forget to make that.”

**How to apply:** Keep signup phone verification and password-reset email delivery separate. Require provider-backed verification rather than treating a client checkbox or an unsent code as successful verification. These are authentication flows, not purchased SMS or calling allowances.
