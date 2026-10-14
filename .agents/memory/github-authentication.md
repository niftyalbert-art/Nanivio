---
name: GitHub authentication boundary
description: Separate shell Git credentials from the connected GitHub App.
---
Treat shell Git authentication and the managed GitHub App connection as independent.

**Why:** Shell pushes were rejected for invalid credentials even while the connected App had repository write access and authenticated API operations worked.

**How to apply:** Verify each access path separately. Do not reconnect a working App or inspect/copy its tokens just because shell Git authentication fails. Any alternative transfer must preserve commit/tree hashes and use a non-forced update of the approved branch only.
