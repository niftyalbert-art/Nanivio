# Nanivio 18 × 18 translation-engine audit

Date: 2026-10-14 Pacific / 2026-10-15 UTC.

## Verdict

**All 18 languages are declared, but a complete working 18 × 18 speech-translation
engine has not been established. There are confirmed misleading implementations,
broken integration paths, and unsupported capability claims—not merely missing
provider settings. Do not approve migration as fully working.**

This is an engine-wide source, routing, configuration, and provider-contract
audit. It is not 306 successful provider translations. No provider responses,
microphone devices, payment data, or usage events were fabricated.

## Coverage and method

- Enumerated all 18 declarations and all **324 directed combinations**:
  **306 non-self translations plus 18 same-language cases**.
- Executed both client routing planners for every combination and compared them
  with the displayed matrix. These are planning operations, not inference.
- Traced HTTP translation, fan-out, real-time chat, call subtitles, call audio,
  voice notes, ASR, TTS, fallback, language detection, and telemetry.
- Checked current workspace secret **presence only**; no values are included.
- Compared provider contracts with official Khaya/Sunbird references and Azure's
  public translation-language catalogue.
- Imported prior real, uncached English → Twi evidence. No additional bulk
  inference was performed: unavailable services cannot prove 306 working pairs.

Reproduce the local planning audit:

    node --import tsx scripts/audit-translation-matrix.mjs

Outputs, excluded from Git/deployment:

- `generated-artifacts/translation-engine-audit/18x18-routing-audit.csv`
- `generated-artifacts/translation-engine-audit/findings.json`

## The 18 languages: declared versus established

Every declaration is active and has ASR, translation, speech output, voice-note,
and two-way-conversation flags enabled. Eleven are labelled FULL and seven
PARTIAL. These are static declarations, not provider capability measurements.

| Language | App code | Preferred MT route | What is established in this workspace |
| --- | --- | --- | --- |
| English | en | Azure; specialists for African pairs | English → Twi text passed. Other directions and full speech pipeline unverified. |
| French | fr | Azure Translator | Azure key absent; provider execution unverified. |
| Spanish | es | Azure Translator | Azure key absent; provider execution unverified. |
| Arabic | ar | Azure Translator | Azure key absent. Geography flag also causes incorrect matrix pivot planning. |
| German | de | Azure Translator | Azure key absent; provider execution unverified. |
| Italian | it | Azure Translator | Azure key absent; provider execution unverified. |
| Portuguese | pt | Azure Translator | Azure key absent; provider execution unverified. |
| Mandarin Chinese | zh | Azure Translator | Azure key absent. Raw `zh` is not listed in the current public MT catalogue; validate/map to `zh-Hans` or `zh-Hant`. This is not a measured provider rejection. |
| Japanese | ja | Azure Translator | Azure key absent; provider execution unverified. |
| Korean | ko | Azure Translator | Azure key absent; provider execution unverified. |
| Swahili | sw | Sunbird | Current service access/output unverified. A Luganda timeout does not prove every Swahili request fails. |
| Luganda | lg | Sunbird | Actual English → Luganda requests timed out. No successful translated output established. |
| Twi / Akan | ak | Khaya | Actual English → Twi text passed. Reverse direction and speech pipeline not verified. |
| Akuapem Twi | tw-ak | Khaya | No distinct MT code mapping. Khaya ASR/TTS catalogue uses `atw`, but that is not proof of a separate MT route. Do not silently substitute generic Twi. |
| Fante | fat | Khaya | English ↔ Fante is documented; account execution and speech not verified. |
| Ewe | ee | Khaya | English ↔ Ewe is documented; account execution and speech not verified. |
| Ga | gaa | Khaya | English ↔ Ga is documented; account execution and speech not verified. |
| Hausa | ha | Khaya preferred; Azure fallback | Khaya's referenced v1 MT catalogue does not list Hausa, although its ASR/TTS catalogue lists `hau`. Azure publicly lists Hausa MT. A suitable route exists in principle but is not configured/verified here. |

**Current configuration:** Khaya/Sunbird API keys and translation URLs exist.
Explicit Khaya ASR/TTS URLs, Sunbird ASR/TTS URLs, Azure Translator key, and Azure
Speech key/region are absent in this workspace. Some Khaya endpoints have code
defaults, so a missing explicit URL alone does not prove all Khaya speech calls
are impossible. Other paths expressly require the URL. Render's settings and
source must be assessed separately.

## How translation actually operates

### Text

Browser text clients call authenticated `/api/translate`. The server uses:

1. Same language: original text, no translation.
2. Either side Ghanaian/Hausa: Khaya first, then some English-pivot/Azure paths.
3. Otherwise either side Swahili/Luganda: Sunbird first, then Azure/pivot paths.
4. Other pairs: Azure Translator.

There is a real response cache. Reusing a genuine translation is legitimate,
but hardcoded cache latency is not a measured request duration.

### Calls

The video-call UI starts `speechService`, which always requests Azure Speech,
then invokes the central engine for subtitles. The context performs a separate
translation toward the local account's language and can generate audio for
injection into Agora. The advertised per-language Khaya/Sunbird ASR selection is
not what this browser listening path implements.

Actual Agora joins prove connectivity, not that speech was captured, correctly
translated, synthesized, published, or heard by the remote participant.

### Voice notes

The server's raw-audio path can run Khaya/Sunbird ASR and MT, but returns
`requiresSynthesis: true`, not a completed audio result. The separate synth call
must succeed. International server-side voice-note ASR explicitly returns
unavailable in that endpoint. A separate Malvi voice endpoint has Azure STT
logic; that does not make the voice-note endpoint complete.

## Confirmed findings and required changes

### Critical: authentication is missing in the main speech/call paths

`engine.ts` calls `/api/translate` without the app bearer token.
`speechService.ts` does the same for the protected Azure speech-token and synth
endpoints. `audio/ttsAudioGenerator.ts` and `tts/subsystem.ts` omit the token on
synthesis requests too. The server checks bearer/custom-header/query tokens;
ordinary fetch calls do not automatically attach the token stored by authClient.
No global authenticated-fetch interceptor was found.

The individual MT adapters repaired earlier do send authentication. Their
successful checks did **not** validate these other clients.

**Change:** use one authenticated transport everywhere; keep auth enforced.

### High: three planning layers disagree

There are **104 combinations** where the matrix's pivot flag disagrees with at
least one client planner. This is not a count of 104 failed real translations.
For example, French → Arabic is shown as a pivot by the matrix because of
geography, although both use Azure; French → Twi can be declared direct by a
client planner despite needing a provider-supported bridge.

The client planner claims **324/324 combinations can execute real-time audio**
without inspecting provider readiness. The separate server route endpoint does
some configuration gating, but it uses different criteria and is not proof that
the planned hops work.

**Change:** one authoritative per-pair, per-hop capability planner used by the
server, clients, matrix, and admin interface.

### High: mixed African routing does not select providers independently per hop

For Twi ↔ Luganda, the HTTP branch selects Khaya whenever either endpoint is in
the Ghanaian set. Its English bridge tries Khaya/Azure on each hop rather than
choosing Khaya for the Twi leg and Sunbird for the Luganda leg.

The same structural issue affects the **24 directed Ghana-family/East-African
combinations**. Azure may cover some hops when configured; this is not a claim
that all 24 necessarily fail with every provider configuration.

The WebSocket chat translator already selects source/target specialist providers
independently for its English pivot. Thus HTTP and WebSocket clients share some
provider code but **do not share one routing algorithm**. This can make the same
language pair behave differently by feature. Its Azure helper also lacks the
HTTP helper's `lg` → `lug` normalization.

**Change:** select source → English and English → target independently.

### High: untranslated fan-out can be reported as successful translation

`/api/translate/fan-out` uses `translatedObj?.text || text` and responds with
`success: true`. It counts target entries, not successful distinct translations.
For African targets it bypasses the complete production pivot router.

The ordinary `/api/translate` endpoint is better: it explicitly reports
`success: false`, `untranslated: true` when no provider produces output.

**Change:** per-target success, provider, error, and untranslated state; never
silently present the original input as a translated result.

### High: claimed NLLB/Google/dialect fallbacks are not implemented engines

The registry initializes NLLB as online, while `NllbMtProvider.canHandle()`
returns false and no local NLLB service is bundled. Its translate method still
calls the generic server endpoint and labels returned output NLLB, even though
that server has no NLLB backend selection.

Routing text advertises Google Cloud and a dialect normalizer, but the inspected
MT execution path contains neither implementation. Lists of fallback providers
are not themselves an executing fallback chain.

**Change:** remove/disable those claims or implement and verify the actual
services. Preserve the real provider provenance.

### High: ASR/TTS contracts do not match the declared all-language capability

- Browser call recognition always uses Azure Speech, not the planned specialist
  provider, and Ghanaian app codes are not fully converted to speech codes.
- Raw Sunbird ASR posts audio bytes and reads `text`/`transcript`/`output.text`.
  Current Sunbird docs require multipart `audio` plus `language`, returning
  `audio_transcription`. A deliberate custom compatibility proxy could differ,
  but this is not the documented current official contract.
- The shared African TTS branch sends `Ocp-Apim-Subscription-Key` for Sunbird
  too. Sunbird's documented service uses bearer authentication.
- Sunbird TTS may return an audio URL; the implementation expects inline audio
  bytes/base64 and does not implement downloading the authenticated result.
- Khaya speech uses app codes without complete service-specific mappings
  (`ak`/`tw-ak`/`ee`/`ha` versus `twi`/`atw`/`ewe`/`hau`).
- TTS `canSynthesize()` returns true for every language without capability checks.

**Change:** separate validated ASR, MT, and TTS contracts and language maps for
each provider. Test each stage rather than treating a key as universal support.

### High: confidence, quality and performance values are misleading

Confirmed fixed values include:

- Central engine default translation confidence **0.95**.
- Pivot confidence **0.91**.
- Quality score **4.85**, estimated BLEU **44.2**, and error rate **0.005**.
- Empty tracker average **920 ms** and ideal percentage **96%**.
- ASR/MT/TTS stage times allocated as **25% / 65% / 10%** of one text operation,
  without measuring those stages.
- Matrix `measuredLatencyMs` populated with fixed estimates (for example,
  **520**, **640**, **980**).
- Provider registry initialized **online** with fixed average latencies.
- All language `lastVerified` values initialized with `Date.now()`, not a test.

Some comprehensive empty-state metrics correctly return zero. That does not
make the other fixed outputs measured evidence. BLEU requires suitable reference
translations; latency does not establish linguistic quality.
The central engine's metrics tracker is separate from session trackers, and
`translateText` does not record a turn into it. No active call-session creation
site was found outside the engine definition, so those session metrics are not
proof of the active UI pipeline's ASR/MT/TTS timings.

**Change:** unknown/null until measured; label estimates; store real verification
time, provider/model, pair, mode, sample, and result. Do not manufacture confidence.

### Medium/high: direction and failure handling need correction

- `LangpretationCallSession` always targets `receiver.myLanguage`, irrespective
  of which participant spoke. Reverse-direction handling needs a recipient
  selected from the speaker identity.
- The video UI initially translates to the remote participant, but the context
  is then called with the local host and translates toward local `myLanguage`.
  This can result in same-language passthrough rather than the intended remote
  output; actual end-to-end recipient routing needs a real two-device check.
- The pivot wrapper can fall back to the English intermediate text when a
  second hop returns no text, yet label it as the requested target language.
- Unknown language codes default to English capabilities. The local planner
  reports an invented code as FULL/executable instead of rejecting it.
- Unmatched language-detection input falls back to English/preference with
  `isReliable: true` and confidence 0.7; this is a heuristic, not model certainty.
- Speech playback errors are swallowed and call the same completion callback;
  `stopSpeaking()` is empty. Failed playback must not look like completed speech.
- TTS `durationMs` in one subsystem is request time, not decoded audio duration.

**Change:** explicit recipient and per-stage state, strict code validation,
honest detection uncertainty, cancellable playback, and no pivot-text leakage.

## What is real, not fake

- There are genuine provider HTTP clients, not just canned phrase dictionaries.
- Real uncached English → Twi output was observed.
- All 324 matrix rows exist, but existence is not successful translation.
- Same-language passthrough, real caching, and English pivots are legitimate
  designs when labelled and executed correctly.
- The local ASR subsystem explicitly throws rather than inventing a transcript.
- Random identifiers and decorative waveform variation are not by themselves
  fabricated speech or translation; do not treat every Math.random as a defect.
- Genuine provider audio decoding and Agora track injection are implemented
  attempts, but their existence is not proof of end-to-end playback.

## Recommended repair and verification order

1. Fix authenticated transport across all active call/text/speech clients.
2. Replace static readiness/verification/quality claims with truthful unknown or
   measured states; fix fan-out and pivot failure reporting.
3. Unify all route planners and select each pivot hop independently.
4. Implement per-provider ASR/MT/TTS language maps and current contracts; decide
   a genuine Akuapem MT route without silently converting it to generic Twi.
5. Resolve Sunbird inference availability and configure/verify the international
   provider; do not assume all 18 languages require a single provider.
6. Verify all **306 text directions** with attributable real outputs. Record
   failures and quality review separately. Validate the **18 self cases** as
   no-translation paths, not successful MT.
7. Verify speech recognition and synthesis for each language, then two-way
   calls/voice notes, physical mobile playback, and actual billing consumption.

This audit is complete as a source/planning review. The assigned live-mobile
verification remains incomplete; no migration or deployment was performed.

## References

- Engine and telemetry: `src/lib/translator-engine/engine.ts`,
  `metrics/latency.ts`, `session.ts`.
- Planning: `matrix/universal18Matrix.ts`, `routing/language-router.ts`,
  `routing/pivot-router.ts`, `providers/registry.ts`, `mt/nllb.ts`.
- Active speech paths: `src/services/speechService.ts`,
  `src/components/calls/VideoCallScreen.tsx`,
  `src/context/NanivioContext.tsx`, `audio/ttsAudioGenerator.ts`,
  `tts/subsystem.ts`.
- HTTP routes: `server.ts`; provider MT clients:
  `src/server/translationProviders.ts`.
- https://khaya-sdk.readthedocs.io/en/latest/languages/
- https://api.sunbird.ai/tutorial
- https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation
