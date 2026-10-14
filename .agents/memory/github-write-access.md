---
name: GitHub write-access verification
description: Distinguish healthy authentication, repository authorization and native Git access before pushing.
---
A healthy GitHub connection does not prove that its account can write to the target repository.

**Why:** This workspace exposed healthy connections while the GitHub API reported read-only repository access and native Git push checks timed out. Separate GitHub connections can represent different accounts, so one connection's permissions do not establish another's.

**How to apply:** Check the chosen connection's authenticated identity and repository permissions, and use a non-writing native push check when relying on native Git. Request the correct account or repository write permission when blocked. Do not interpret a timeout alone as an expired credential, force-push around the problem, or switch a production-connected branch just to make changes testable.

The authenticated GitHub Git Data API is a fallback when native Git remains unavailable; preserve the original objects and parent history rather than creating replacement commits.

**Why:** Reconnecting the GitHub App restored repository write access without fixing native Git, while Git Data uploads reproduced the original object hashes.

**How to apply:** Verify uploaded object hashes against local Git and create only the intended new review reference after its complete history is available. Keep existing production-connected references unchanged.
