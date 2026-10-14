---
name: Branch safety
description: The user's standing Git branch restriction for this project.
---
Work only on `malvi-production-upgrade`. Do not modify, merge into, or push to `main`.

**Why:** The user explicitly identified `malvi-production-upgrade`, not `main`, as the production-upgrade source and required branch.

**How to apply:** Verify the checked-out branch before edits/commits and name the exact branch in push commands. A request to push all changes does not authorize a main merge or force-push.
