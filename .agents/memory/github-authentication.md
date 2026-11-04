---
name: GitHub authentication boundary
description: Separate shell Git credentials from the connected GitHub App.
---
Treat shell Git authentication and the managed GitHub App connection as independent.

**Why:** Shell pushes were rejected for invalid credentials even while the connected App had repository write access and authenticated API operations worked.

**How to apply:** Verify each access path separately. Do not reconnect a working App or inspect/copy its tokens just because shell Git authentication fails. Any alternative transfer must preserve commit/tree hashes and use a non-forced update of the approved branch only.

A shell push can update GitHub successfully, then exit nonzero because workspace protection prevents writing the local remote-tracking ref.

**Why:** The remote update and local bookkeeping are separate operations. Treating the exit code alone as a rejected push can lead to unnecessary retries or incorrect recovery.

**How to apply:** Compare `git ls-remote` for the exact approved branch with the intended local commit before retrying. Never force-push to repair a local tracking-ref failure.
