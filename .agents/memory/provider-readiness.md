---
name: Provider readiness evidence
description: Distinguishing configured providers from verified service output.
---
A provider's configuration flags and successful authentication are not evidence
that the intended operation works. Require real output matching the service
contract; distinguish availability from linguistic quality.

**Why:** An authenticated HTTP-200 response during translation verification
contained speech-synthesis output rather than a text translation. A working key
did not establish that the configured endpoint was the right service.

**How to apply:** Check actual uncached output for the requested operation and
language pair. Never count echoed untranslated text, audio metadata, configuration
flags, or pure contract tests as live translation evidence. Diagnose failures
using bounded structural metadata and fixed reason codes, not credentials or
raw upstream payloads.
