---
name: Legacy private-chat cache ownership
description: Why unowned shared-browser chat caches must not be assigned to the current account.
---
Do not automatically import the old shared chat cache into an account's private chat history, and do not delete it as part of an access-control repair.

**Why:** The old cache has no authenticated ownership marker. Assigning it to the next account that signs in could expose another account's history. Leaving it untouched preserves the possibility of a controlled recovery.

**How to apply:** Treat legacy cache recovery as a separate operation requiring ownership verification and current server-authoritative membership. Do not infer ownership from the last saved profile, display names, or claimed Nanivio numbers.
