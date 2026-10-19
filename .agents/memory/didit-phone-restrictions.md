---
name: Didit phone API restrictions
description: Endpoint-specific authorization and funding rules that generic API-key docs and rendered extraction can omit.
---

Do not diagnose Didit phone-send HTTP 403 as permissions alone or automatically
resolve it by broadening the key. Check endpoint-specific authentication and
organization funding requirements before changing permissions or providers.

**Why:** Didit's generic API-key documentation describes invalid credentials as
401, but its full phone-send Markdown documents 403 for invalid credentials,
the first-top-up anti-abuse gate, and insufficient balance. The rendered-page
extraction omitted these introductory details while the `.md` version included
them. This can make a narrow permissions-only diagnostic misleading.

**How to apply:** Read
https://docs.didit.me/standalone-apis/phone-send.md
alongside https://docs.didit.me/console/api-keys. Confirm whether the organization
has ever topped up and use only recognized, sanitized upstream reasons to
distinguish failures. Do not assume a 403 proves invalid credentials, a UAE
restriction, or that purchasing credit alone will fix it. Standalone checks
require Sessions write without workflow or approved-only restrictions.
