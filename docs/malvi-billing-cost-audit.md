# Malvi billing cost audit

Reviewed 2026-10-24, America/Los_Angeles. This is a read-only code and
public-provider-pricing assessment, not a statement of account balances,
production model overrides, guaranteed margins or completed billing changes.
No paid inference, avatar sessions, purchases or provider changes were made.

## Product requirements

- Add a separate Voice plan without removing existing purchased benefits.
- Determine provider usage and quota economics before setting new prices.
- USD is the base and default billing price. GHS is an optional conversion from
  USD, not an independently maintained price list.
- Administrators must be able to access and edit billing prices and allowances.

## Services and units

| Service | Role actually found | Cost unit / public evidence | Unknown before final pricing |
| --- | --- | --- | --- |
| Gemini Live | Default live reasoning and native speech; code default `gemini-3.8-live` | Public Standard rates: $0.75/million text input tokens, $3/million audio input tokens (published equivalent $0.005/input audio minute), $1/million image/video input tokens (published equivalent $0.002/minute), $4.50/million text output tokens, $12/million audio output tokens (published equivalent $0.018/output audio minute) | Actual production model, paid/free project tier, account RPM/TPM/session limits, consumption and discounts |
| Gemini Flash | Text chat, file analysis, business generation and grounded public research; code default `gemini-3.8-flash` | Standard input $0.75/million and output including thinking $3.75/million through 2026-12-31; published rates rise to $1.50/$7.50 on 2027-01-01 | Actual input/output/context sizes, production overrides, paid tier and usage |
| Google Search grounding | Current cited web research through Gemini | Published 5,000 free search requests/month shared across Gemini 3+ models, then $14/1,000; documentation says one user request may trigger multiple billable search queries | Shared project consumption and actual search activity per user request |
| LiveAvatar LITE | Avatar rendering/video; no second built-in reasoning/voice stack | 1 credit/session minute; public Essential $99/1,100 monthly credits; Business $475/6,000. Overage documented as $0.095/$0.09 per credit respectively | Actual account plan, credits, overage setting, negotiated rate and utilization |
| ElevenLabs | Optional administrator-selected speech, code uses `eleven_multilingual_v2`, not Flash/Turbo | Current public API page lists v2 Multilingual at $0.08/1,000 input characters; account/legacy credit plans can differ | Actual connected subscription, remaining balance, restrictions and account-specific rate |
| OpenAI | Optional alternative live brain, code default `gpt-live-1`; not a second simultaneous brain | Public GPT-Live-1 listing $0.05/minute; account terms and any selected separate speech path must also be accounted for | Whether enabled, actual model and billing configuration, limits and usage |
| Nanivio Mic and voice effects | Owned capture/transport/processing, not a self-hosted transcription model | No independent third-party microphone API fee; cloud audio sent to the selected brain is still billable, plus compute/network | Server CPU/network allocation and measured input duration |
| Wikipedia, Wikidata, arXiv, PubMed | Explicit public reference-source bridges | No per-query API charge identified for these configured public endpoints; access limits and responsible use still apply | Account/API policies where applicable, traffic and infrastructure |
| Wikimedia Commons | Real public image/video lookup, not image/video generation | No paid media-generation call in this path; source attribution/license and public API limits still apply | Traffic, media delivery/codec behavior and operational availability |
| Google Maps URL handoff and GPS | Tap-to-open navigation and device permissioned location | This implementation does not invoke a paid Maps SDK, Routes API or Maps-grounding API | Any future embedded routing/geocoding would require separate costing |
| ipwho.is | Explicit approximate IP lookup | Current free endpoint: 1,000 requests/day; browser CORS traffic shares the domain quota, no SLA. Public Pro plans start $19.99/month | Production traffic and whether a paid endpoint is needed |
| Render, Key Value/Redis, Supabase | Hosting, concurrency/session state, history/database and network | Infrastructure subscriptions, storage/egress and resource usage, not AI brains. Render currently lists paid Key Value from $10/month | Actual service invoices, database plan, storage, bandwidth and paying-user count |
| Payment processing, FX and tax | Collection and settlement | Merchant-/market-specific fees and settlement/FX terms | Paystack merchant capabilities, effective fees, tax treatment and chosen FX source |

Gemini native speech must not be priced as though ElevenLabs is also used.
Voice-only has no LiveAvatar charge. Avatar use adds rendering charges on top
of the selected brain/speech costs. A listed provider is not evidence that its
API ran or that it incurred a charge.

## Existing controls are not monthly billing quotas

The live service has one active session per account, 10 starts/hour, a
10-minute maximum session and a 60-second idle timeout. Avatar billing is for
session time, not only the seconds during which Malvi speaks. Provider plan
session/concurrency restrictions may be stricter.

New input limits are 8 MiB binary / 128 KiB text, first 60 seconds of video
analysis, 45-second inference timeout and 3,000 maximum output tokens. Browser
voice-note recording stops at 60 seconds; this is not a duration bound for all
uploaded audio. Per-account analysis concurrency and the four-per-minute
analysis/research limiter are process-local guards.

These controls do not establish persistent monthly spending entitlements.
An upload count alone cannot price arbitrary PDFs/audio/video fairly: input
tokens/duration/pages and generated output matter. Search-query consumption
can exceed the count of user research requests. Conversation history/context
can be billed again as input to later turns.

Free provider quotas are shared account/project capacity, not a renewable
free allocation for every Nanivio customer. Gemini RPM/TPM/RPD limits apply
per project, not independently to every API key. Account limits must be
verified in the provider dashboard and not inferred from configured keys.

## Cost examples, not proposed selling prices

- Essential avatar capacity, fully utilized: $99 / 1,100 = $0.09 per LITE minute.
  300 minutes allocate $27 before the brain, speech, infrastructure or fees.
- Business avatar capacity, fully utilized: $475 / 6,000 ≈ $0.07917 per minute;
  300 minutes allocate $23.75 before other costs.
- These public examples exceed the current $14.99 Premium price at full use.
  An actual negotiated lower rate or lower allowance changes the result.
  Underutilized prepaid capacity makes the effective used-minute cost higher.
- One minute of Gemini audio input plus one minute of output costs about
  $0.023 at the published equivalents, before text/context/vision/search.
  This is NOT a guaranteed price per wall-clock conversation minute.
- A Flash request using 10,000 input and 1,000 total output tokens costs
  $0.01125 at the current Standard rates, before grounding or other tools;
  $0.0225 at the published 2027 rates. This example is not a fixed file price.

Use measured usage and the approved maximum monthly allowances to model:

    monthly cost =
      selected brain + selected speech + avatar session time
      + grounding/tools + allocated hosting/database/network
      + payment/FX/tax costs + operating contingency

Any target gross margin must be explicitly chosen rather than assumed.
For processor percentage f, target margin m, fixed fee k and other cost C:

    minimum price = (C + k) / (1 - f - m)

This simplified illustration excludes jurisdiction-specific tax adjustments
and requires a positive denominator. Do not publish a plan based on assumed
average under-use while allowing unlimited expensive consumption.

## USD, conversion and administrator implementation requirements

Current billing surfaces default to GHS in multiple places. USD and GHS plan
amounts are independent catalogue values. `/api/fintech/rates` currently
fails explicitly with `FX_PROVIDER_NOT_CONFIGURED`; no live automatic
conversion is established. Existing admin pricing-rule controls are not a
complete persistent Malvi catalogue/feature/allowance editor.

The next implementation should:

1. Store authoritative plan prices in USD minor units and default the billing
   display to USD; permit the user to choose GHS.
2. Derive GHS from a configured, timestamped FX source, with source/as-of
   display, bounded freshness and explicit failure for unavailable conversion.
   Do not silently fall back to today's separately hardcoded GHS catalogue.
3. Create checkout quotes on the server. Snapshot USD base amount, FX rate,
   rate timestamp/source, GHS minor-unit amount, plan version, user and expiry.
   Verify provider payment against that exact order, not a later FX rate or
   a client-supplied price. Display currency and settlement currency are
   separate; confirm merchant-supported settlement currencies.
4. Provide role-protected, validated, persistent admin editing for USD prices,
   enabled plans, feature groups, voice/avatar allowances, input/research
   budgets, cost assumptions and FX policy. Track actor and old/new versions.
   Show unknown provider quotas as unknown, not zero or unlimited.
5. Keep the new Voice plan an unpublished draft until its allowances, provider
   budget enforcement and reviewed price are ready. The existing paid
   purchases/periods/consumption must not be reset or retroactively removed.
6. Tie monthly allowances and usage reservations to authenticated accounts
   using shared atomic storage. Existing safeguards are not sufficient for
   multi-instance cost enforcement.

No customer-facing price, plan purchase, FX conversion or admin editor was
changed by this audit.

## Public infrastructure, payments and FX baselines

Researched directly from official public sources after the user asked to
search for the costs rather than require account screenshots.

| Item | Public baseline | Qualification |
| --- | --- | --- |
| Render Standard web instance | $25/month, 2 GB RAM | An estimating baseline, not proof of this application's current instance or sufficient capacity for every workload |
| Render paid Key Value | From $10/month, 256 MB | Provider connection/storage limits and application usage must fit |
| Supabase Pro | From $25/month | First project includes compute credit sufficient for Micro; do not add the same included compute a second time |
| Supabase Pro included capacity | 100,000 MAU, 8 GB database disk/project, 100 GB file storage, 250 GB egress and 250 GB cached egress | Published overages include $0.00325/additional MAU, $0.125/GB disk, $0.0213/GB file storage, $0.09/GB egress and $0.03/GB cached egress |
| Paystack Ghana | 1.95% published local and international transaction fee | Official country table lists Ghana acceptance as GHS; tax/account terms may add costs |
| ExchangeRate-API Open Access | No API key, free personal/commercial conversion use with required attribution | Daily updates, cache responses, no guaranteed unlimited requests or bank settlement-rate matching |

An illustrative infrastructure baseline is $25 + $10 + $25 = **$60/month**,
excluding workspace/team fees, add-ons, tax, excess resources and AI usage.
With a public LiveAvatar Essential subscription, fixed commitments would be
**$159/month**, including its 1,100 avatar credits. These are scenarios, not
retrieved private invoices. At 100 paying customers, the $60 infrastructure
component allocates $0.60/customer; 1,100 prepaid avatar minutes shared between
them provide only 11 minutes/customer at equal use.

Avoid double counting avatar cost. Either model the subscription plus paid
overage at fleet level, or allocate an effective prepaid minute cost at the
assumed utilization level. Do not add the full avatar subscription again after
already allocating its entire cost per minute.

For example, 100 customers using 300 LITE minutes each require 30,000 credits.
At the public Essential subscription and overage rate, the avatar component
alone would be $99 + (30,000 - 1,100) × $0.095 = **$2,844.50/month**. This
scenario requires overage enabled and does not establish available concurrency.

An actual read-only request to the official open FX endpoint returned:

- Endpoint: `https://open.er-api.com/v6/latest/USD`
- Base: USD
- USD/GHS: **11.67155**
- Provider timestamp: **2026-10-25 00:02:31 UTC**
- Next advertised update: **2026-10-26 00:06:21 UTC**

This historical audit snapshot is not a permanently valid checkout rate.
The published rates are indicative reference rates, not guaranteed Paystack,
cardholder-bank or payout settlement rates. Cache according to the provider's
update schedule, display attribution and source timestamp, validate freshness,
and quote a server-calculated final payable amount before collection.

USD catalogue/display pricing is compatible with a Ghana merchant collecting
an explicitly disclosed GHS amount. It does not make that merchant eligible
for direct USD collection. Paystack's official international-payment article
currently lists direct USD acceptance/settlement for Nigeria and Kenya, not
Ghana. Do not silently submit USD to a GHS-only merchant or promise all
international customers that their bank will use the reference FX rate.

Public Gemini quota documentation says actual active RPM/TPM and other
model-specific limits are project-/tier-dependent and points to AI Studio.
No universally applicable production quota or remaining credit balance can
be established by a public web search. Keep these fields explicitly unknown
or administrator-confirmed, without preventing a public-rate estimate.

## Sources

Official public pages consulted; actual account contracts can differ:

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://docs.liveavatar.com/docs/faq/credits
- https://www.liveavatar.com/pricing
- https://elevenlabs.io/pricing/api
- https://openai.com/api/pricing/
- https://ipwhois.io/documentation
- https://render.com/pricing
- https://paystack.com/docs/api/transaction/
- https://supabase.com/pricing
- https://support.paystack.com/en/articles/2130306
- https://support.paystack.com/en/articles/2130690
- https://www.exchangerate-api.com/docs/free
- https://open.er-api.com/v6/latest/USD
