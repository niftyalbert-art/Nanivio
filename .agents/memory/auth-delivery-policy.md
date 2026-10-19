---
name: Authentication delivery providers
description: User-specified provider responsibilities for signup verification and password recovery.
---

Collect both phone number and email at registration, and do not allow either to register twice. Verify email instead of sending signup SMS. Remove city and constituency/district requests from signup. A collected number is not proof of phone ownership.

**Why:** The user explicitly changed signup to email verification after discussing the cost of mandatory SMS at global scale.

**How to apply:** Apply the identity rule across all signup roles, normalize international numbers and email case, and require real provider-backed email delivery/verification. Do not silently restore paid signup SMS or claim a collected phone is verified. Email verification at signup is separate from password recovery.

Resend remains the user's requested provider for “Forgot password” reset verification. The user previously selected Didit for SMS and rejected Infobip; do not request Infobip credentials again.

**Why:** The user explicitly assigned password recovery to Resend and rejected Infobip during provider setup. The later change removes mandatory signup SMS, not the need for secure password recovery.

**How to apply:** Preserve real password-reset security and the user's provider boundary. Authentication checks are not purchased SMS or calling allowances.

For signup phone verification, technical provider errors should appear only in protected administrator diagnostics and server logs. Signup users should receive a simple retry message.

**Why:** The user explicitly approved keeping technical details away from signup users and requested that the same diagnostics appear in the admin dashboard.

**How to apply:** Preserve the public/admin separation when changing error handling. Never include API keys, phone numbers, verification codes or raw provider response bodies in the diagnostic feed.
