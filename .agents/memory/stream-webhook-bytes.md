---
name: GetStream webhook signed bytes
description: Compression and byte-preservation rules for GetStream webhook signature verification.
---
GetStream webhook HMAC signatures cover the uncompressed JSON bytes, even when transport uses gzip.

**Why:** This is the signing contract in GetStream's official SDK. Verifying compressed wire bytes or reserializing parsed JSON can reject valid requests or lose the exact signed representation.

**How to apply:** Preserve the parser's inflated bytes before JSON parsing and verify those bytes without rebuilding JSON. Keep regression coverage for both plain and gzipped payloads; consult the current official SDK when changing the parser or signing implementation.
