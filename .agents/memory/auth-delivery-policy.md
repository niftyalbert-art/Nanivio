---
name: Authentication delivery providers
description: User-specified provider responsibilities for signup verification and password recovery.
---

Signup user mobile-number verification requires an international provider: the user stated, “Nanivio Is global App not only in Ghana.” Twilio was originally selected, but the user reports its account is suspended. The user subsequently registered with Prelude and requested setup guidance; use Prelude as the intended replacement. Use Resend for “Forgot password” reset verification.

**Why:** The user explicitly specified the authentication responsibilities and subsequently clarified that Nanivio needs global coverage.

**How to apply:** Do not choose a Ghana-only signup verification solution. Confirm destination coverage and pricing for the selected international provider. Keep signup phone verification and password-reset email delivery separate. Require provider-backed verification rather than treating a client checkbox or an unsent code as successful verification. These are authentication flows, not purchased SMS or calling allowances.

Prelude's strict `channels` request option requires separate provider enablement. SMS preference is not a guarantee of SMS-only delivery; confirm dashboard routing before promising exclusivity.

**Why:** The provider's API documentation distinguishes `preferred_channel` from the account-gated strict channel list.

**How to apply:** Use the standard preference on new accounts, report the actual returned channel, and verify provider entitlement before introducing a strict channel list.
