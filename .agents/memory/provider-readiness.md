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

Do not infer invalid credentials, exhausted quota, or a particular provider-side
failure from a timeout alone. Public documentation being reachable does not
establish that inference is available within the application's latency budget.

The user expects translation audits to cover the full 18 × 18 language design,
not only Twi and Luganda.

**Why:** The user corrected the narrower focus and asked to identify fake
implementations and changes needed across the engine and all available languages.

**How to apply:** Review every declared language, cross-provider route, and
ASR/MT/TTS stage. Separate exhaustive planning checks from actual provider output
and real speech-to-speech evidence.

Do not treat absence from a published language catalogue as proof that every
provider rejects that language. Preserve distinct dialect codes when probing.

**Why:** Khaya's SDK explicitly states that its catalogues are not exhaustive
whitelists, and ASR/TTS coverage differs from MT coverage.

**How to apply:** Check the operation-specific contract and real response using
the distinct ISO code. Record the actual service/version result; never silently
substitute a generic language for a promised dialect.

Optional metadata access and the required synthesis permission are separate.

**Why:** ElevenLabs repeatedly denied voice listing with `voices_read` missing,
while the user's key settings showed Text to Speech access and did not expose
the requested Voices permission. Direct synthesis with the known voice ID
subsequently succeeded without adding that optional metadata permission.

**How to apply:** Do not repeatedly ask the user to find an absent dashboard
setting or remove key restrictions. Offer one explicitly approved, short synthesis
test using the known voice ID; distinguish its result from metadata access and
from full application integration.
