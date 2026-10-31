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

Treat paid voice processing and recipient delivery as separate outcomes. Keep a
completed translation when upload or sending fails; retry delivery rather than
repeating speech processing. Never automatically resend unconfirmed messages.

**Why:** Processing can consume provider credits and account allowance before
media upload or message delivery succeeds. Repeating inference after a transport
failure can charge for the same recording again.

**How to apply:** Latency optimizations may overlap upload and processing, but
must preserve successful paid output across upload failures. Keep delivery
verification separate from direct speech-pipeline tests.

Do not infer invalid credentials, exhausted quota, or a particular provider-side
failure from a timeout alone. Public documentation being reachable does not
establish that inference is available within the application's latency budget.

A successful model-list request is discovery metadata, not proof that the same
key can use that model for inference.

**Why:** Gemini listed a model whose subsequent recognition and translation
requests returned `404 NOT_FOUND`. Another listed model returned service
unavailability and timeouts. The model lifecycle documentation alone did not
explain those runtime results.

**How to apply:** Verify the exact model, endpoint and operation with an approved,
bounded probe before recommending a switch. Keep model-list results separate
from inference results, and do not assert retirement, invalid credentials or a
working alternative based on catalogue presence or absence alone.

The user expects translation audits to cover the full 18 × 18 language design,
not only Twi and Luganda.

**Why:** The user corrected the narrower focus and asked to identify fake
implementations and changes needed across the engine and all available languages.

**How to apply:** Review every declared language, cross-provider route, and
ASR/MT/TTS stage. Separate exhaustive planning checks from actual provider output
and real speech-to-speech evidence.

Do not ask the owner to narrow Langpretation to a selected language pair as the
implementation scope. The required product is any pairing across all 18
languages in both directions.

**Why:** The owner reiterated the 18 × 18 requirement after being asked to choose
an initial English/Twi or English/Luganda pair.

**How to apply:** Organize implementation and readiness reporting around the
whole matrix. Individual test pairs can be execution steps, not a replacement
for the full scope; same-language sessions preserve original speech.

For Langpretation, the owner chose the existing Gemini service instead of
Azure for international-language recognition, translation and spoken output.
Keep Khaya and Sunbird specialist routes and Malvi's approved voice settings
separate from this choice.

**Why:** The owner explicitly selected “Use existing Gemini” rather than
waiting for Azure setup or comparing other providers.

**How to apply:** Do not reintroduce an Azure credential requirement or silently
switch providers on failure. Verify the chosen models and real language output
separately from routing tests, and account for Langpretation and Malvi sharing
Gemini quota. This selection does not establish Akuapem dialect coverage.

Do not treat absence from a published language catalogue as proof that every
provider rejects that language. Preserve distinct dialect codes when probing.

**Why:** Khaya's SDK explicitly states that its catalogues are not exhaustive
whitelists, and ASR/TTS coverage differs from MT coverage.

**How to apply:** Check the operation-specific contract and real response using
the distinct ISO code. Record the actual service/version result; never silently
substitute a generic language for a promised dialect.

Optional metadata access and the required synthesis permission are separate.

**Why:** ElevenLabs denied optional voice and model listing while synthesis with
the known voice ID succeeded. The user's key settings showed Text to Speech
access and did not expose the previously requested Voices permission.

**How to apply:** Do not repeatedly ask the user to find an absent dashboard
setting or remove key restrictions. Offer one explicitly approved, short synthesis
test using the known voice ID; distinguish its result from metadata access and
from full application integration.

Count actual synthesis HTTP requests when enforcing a single-attempt test or
spending limit; an application-level call count is not sufficient.

**Why:** The connector SDK can automatically repeat a request after HTTP 401 while
refreshing authentication, even when the application does not implement retries.

**How to apply:** Check SDK retry behavior and count underlying provider requests
in cost-sensitive verification. Suppress extra synthesis attempts in a test that
the user approved for only one request; never silently switch transports.

Avatar speaking notifications are not proof of browser audio/video playout timing.

**Why:** A real LiveAvatar-only recording showed the speaking-start notification
preceding audible speech. Paired audio/video tracks and successful rendering did
not establish that phonemes matched lip movements on the user's Render device.

**How to apply:** Separate provider processing events, returned-stream recordings,
subtitle pacing, and physical-device lip-sync acceptance. Do not anchor a claim of
accurate synchronization solely to SDK speaking events or apply a global delay
from a headless recording without reproducing the target browser's mismatch.
The user's reported voice-before-lips mismatch was on Android Chrome; a desktop
browser replay does not verify that phone's decoder, audio output, or live stream.
