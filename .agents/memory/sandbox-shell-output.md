---
name: Programmatic shell output delimiters
description: Why shellExec callback output must not be treated as byte-preserving.
---
Do not rely on literal tabs surviving the programmatic `shellExec` callback's output boundary.

**Why:** A Git tree listing arrived with the tab between each blob hash and path removed. Tab-based parsing silently treated every remote file as different from the local tree.

**How to apply:** Serialize structured shell results as JSON before returning them through the callback, and validate parsed counts. Use base64 for exact binary output, or read files directly inside the documented impure boundary. Do not infer repository changes from a malformed listing.
