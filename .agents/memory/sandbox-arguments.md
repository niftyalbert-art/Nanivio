---
name: Large sandbox arguments
description: Large individual string arguments can fail before an isolated API execution begins.
---
Pass unusually long API payload strings across the isolated execution boundary as smaller string segments, and assemble them inside the isolated function.

**Why:** A large single-string Git blob argument failed to parse before its API request ran. Passing the same content as smaller segments succeeded and retained the original Git object hash; the problem was not GitHub authorization or file contents.

**How to apply:** Use this when transferring large documents or binary encodings into an isolated API call. Keep credentials injected by the connection, and do not reconnect an integration to resolve this parsing failure.

Keep large transfer payloads transient and retain only verified progress across executions.

**Why:** Retaining multiple payload representations can exceed notebook state limits and reset local progress, without undoing writes already accepted by GitHub.

**How to apply:** Upload bounded batches, retain hashes instead of redundant payload copies, and reconcile the remote state before retrying an interrupted write.
