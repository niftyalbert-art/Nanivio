---
name: Large sandbox arguments
description: Large individual string arguments can fail before an isolated API execution begins.
---
Pass unusually long API payload strings across the isolated execution boundary as smaller string segments, and assemble them inside the isolated function.

**Why:** A large single-string Git blob argument failed to parse before its API request ran. Passing the same content as smaller segments succeeded and retained the original Git object hash; the problem was not GitHub authorization or file contents.

**How to apply:** Use this when transferring large documents or binary encodings into an isolated API call. Keep credentials injected by the connection, and do not reconnect an integration to resolve this parsing failure.

Keep bulk Git-object exports inside an isolated execution and return only verified hashes or counts.

**Why:** Retaining raw exports, parsed objects and chunked copies together exceeded the notebook's 32 MiB state limit and reset its variables. This did not undo already completed GitHub requests.

**How to apply:** Read ignored export files inside the isolated upload function rather than retaining multiple payload representations across notebook calls. Resume from verified batches after a reset.

Recreate isolated helper functions in the execution that calls them.

**Why:** Reusing a persisted isolated function in a later execution failed with `executeJs is not defined`, while creating and invoking the same function in one execution succeeded.

**How to apply:** Persist small progress values, not isolated function wrappers; an invocation failure alone does not mean the GitHub connection needs reauthorization.
