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

If segmented raw source still fails with a replay error, encode the UTF-8 bytes as base64 before crossing the boundary, segment the encoding, and use the Git blob API's base64 encoding.

**Why:** Segmented source containing extensive embedded code failed before its request ran, while the base64 transfer succeeded with the exact expected blob hash. This was not a permission error.

**How to apply:** Verify the uploaded blob and final tree/commit hashes, and recheck the remote branch before a non-forced reference update. Do not assume an interrupted batch made no writes.

Large unsegmented base64 strings can also surface as a proxy HTTP 400 “malformed request,” rather than a parse error.

**Why:** The same Git blob succeeded with its expected hash after its base64 payload was split into smaller strings at the isolated-execution boundary.

**How to apply:** Segment large encodings before passing them into isolated functions, join them only inside that function, and verify returned hashes before updating a branch.

For local Git-object transfers, read the Git blobs inside the isolated function and upload them directly through the connected API instead of carrying their contents through notebook state or shell callback output.

**Why:** Large retained payloads reset execution state and temporary files. Shell callback output also altered/truncated a large encoded blob without a useful truncation flag, producing a different uploaded Git hash. Reading the exact Git object with Node's standard child-process module inside the isolated function preserved every verified blob and tree hash.

**How to apply:** Use read-only Git commands against the known workspace directory, keep credentials injected by the connector, and return only hashes/counts. Verify the exact release tree and parent before a non-forced update of the approved branch. Re-read the remote reference after interrupted operations; do not assume a write failed just because the notebook stopped.
