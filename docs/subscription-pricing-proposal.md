# Nanivio subscription pricing proposal

**Status: the owner instructed us to implement the replacement bills now. The replacement catalogue, versioned checkout snapshots, three-rail activation, core allowance meters, annual monthly allocations and ten resource-specific add-ons are connected. The owner reported successful installation of migrations 024 and 025. Code delivery is a billing-only release; a Git push is not itself proof that Render is serving the replacement catalogue. Provider-cost confirmation, measured route weighting, paid search/storage enforcement and cross-member Business pooling still require separate completion; the estimates below are not verified production margins.**

## Pricing direction

Balance prices and included usage, rather than preserving unsustainable allowances or raising every plan to cover its old allowance. Preserve purchased benefits for their paid term. Present new terms explicitly at renewal; do not silently increase an existing recurring charge.

### Approved catalogue replacement

The owner requires the new billing catalogue to **replace**, not sit alongside,
the old subscription offers. The owner selected **keep benefits until expiry**
for customers who have already paid.

At the approved cutover:
- Show only the new offers in pricing cards, plan selectors and new checkouts.
- Retire the old offers from new sales and renewals; retain their identities for
  paid-order recovery, receipts, audit history and existing entitlements.
- Show an unexpired legacy purchase only under **Your current subscription**
  or billing history, not as another available plan.
- Preserve its purchased benefits and original expiry. Do not migrate, refill,
  reduce or extend it merely because the catalogue changed.
- After expiry, offer the new plans and obtain the customer's acceptance of
  their terms. Do not automatically charge the new price.
- Honour already-paid orders using their original verified purchase snapshots.
  Do not invalidate payment recovery when an offer is archived.

This is the cutover policy, not permission to remove the working catalogue
before its replacement passes the required integrations and release review.

The proposed USD prices below are estimates from public provider rates, not verified account invoices or a profitability guarantee. GHS is derived from a current, disclosed exchange-rate quote. Payment method must not change the purchased benefits.

## Proposed Malvi catalogue

| Plan | Monthly USD | Annual USD | Voice-only minutes per month | Avatar minutes per month |
|---|---:|---:|---:|---:|
| Voice | 7.99 | 85.99 | 80 | 0 |
| Basic | 9.99 | 107.99 | 20 | 15 |
| Premium | 24.99 | 269.99 | 50 | 40 |
| Business | 79.99 | 859.99 | 160 | 120 |

The two allowances are separate: an avatar conversation does not also deduct voice-only minutes. Business allowances are pooled across the purchased workspace, not multiplied per seat. Shared meeting rendering must not duplicate the host's avatar charge for each viewer.

Keep the existing account-bound three-minute Malvi trial; selecting Free or signing in again does not refill it. Publish Voice only after its existing runtime-readiness checks pass.

Premium's costing includes up to 20 paid search queries per month and Business up to 100. A research action may trigger multiple provider queries. Larger research, file/image analysis and unusually long context require an explicit capped allowance or a separately accepted quote, never an "unlimited" promise. Do not advertise capabilities a tier does not actually implement.

### Malvi costing assumptions

- Gemini-based voice/reasoning budget: **$0.03 per voice-only conversation minute**. This is a planning budget, not a provider flat rate. Public Gemini Live audio input is $0.005/audio minute and output $0.018/generated audio minute; text/context also costs money.
- Avatar conversation budget: **$0.16 per customer-charged minute**. This includes LiveAvatar Lite, Gemini speech/context and an assumed startup/idle overhead. One component is approximately $0.095 per provider-streamed Lite minute; provider-streamed time is not necessarily customer-metered active time.
- Paid search: $0.014 per provider query, without relying on shared free quotas.
- Add **15% cost contingency** and a **1.95% Paystack Ghana fee assumption**.
- At full proposed usage, modeled contribution margins are approximately 60–64% monthly and 56–60% annually, before shared hosting, support, taxes and other unmodeled costs.
- These prices are **not approved for an unverified ElevenLabs delivery configuration**. Its model/character charges must be modeled separately if selected. Never change Malvi's approved voice or silently switch providers to meet a price.
- Excess startup/idle time, repeated failed sessions, large prompts or additional tool work can exceed this model. Measure provider-streamed time and actual usage before publication; enforce separately approved platform spending limits without erasing purchased user allowances.

## Proposed communication catalogue

| Plan | Monthly USD | Annual USD | Two-person call minutes/month | Standard-equivalent live Langpretation minutes/month | Text translations/month | Translated source characters/month | Storage |
|---|---:|---:|---:|---:|---:|---:|---:|
| Individual Premium | 14.99 | 159.99 | 200 | 20 | 300 | 20,000 | 2 GB |
| Langpretation Pro | 39.99 | 439.99 | 500 | 60 | 1,000 | 75,000 | 10 GB |
| Business / B2B | 129.99 | 1399.99 | 1,500 | 200 | 3,000 | 250,000 | 50 GB pooled |

Text translation is limited by **both** completed translation requests and source characters; reaching either limit ends the included text allowance. Internal chunking/retries must not become extra customer message charges. Internal provider requests still require their own cost accounting.

Keep ordinary P2P text chat and untranslated voice notes free. Preserve the agreed 30-day ordinary calling trial beginning with the first connected call, including existing administrator-controlled safety limits. Do not issue another trial when a user changes plan.

Call allowance is connected wall-clock time for one two-person audio or standard-HD video call, not a participant-minute count. The caller funds ordinary calling; receiving a call alone does not require a paid recipient. An accepted Langpretation sponsor funds translation in both directions. Translated calls consume their underlying calling allowance as well as translation allowance; show this before enabling translation. Do not extend these two-person prices to arbitrary group sizes or Full HD/2K video.

### Language and voice-note accounting

The live allowance is **standard-equivalent usage**, not a promise that every language pair gets the same number of elapsed minutes.

One standard-equivalent minute is modeled as $0.08 of upstream translation cost: two separately billed Palabra directions at $0.04/minute each. Actual billed usage must be confirmed against provider accounting; do not assume that silence, source-audio duration and connected time are interchangeable.

For Khaya, recognize ASR, translation and TTS request costs separately. Illustratively, three requests per four seconds of voiced source audio means 45 requests per source-audio minute. At $89.95/20,000 requests, that allocates approximately $0.2024 per source-audio minute before other costs. Shorter turns or overlapping speakers can cost more. This is a scenario, not a measured production rate or a fixed multiplier.

Use a versioned route-cost schedule and normalized usage accounting. Show the selected route's expected consumption and a spending/usage cap before starting. Do not apply a guessed permanent multiplier by country or claim full 18×18 coverage from this pricing work. A provider-route rate change cannot retroactively reduce a purchased entitlement.

Voice-note Langpretation includes recognition, translation and translated playback as one quoted operation. Do not charge its generated transcript again as an independent text translation. Original untranslated recording/playback stays free. Its allowance deduction should reflect the selected pipeline's actual billing units, not automatically equal the cost of an always-connected live session.

### Communication costing assumptions

- Standard two-direction translation: $0.08 per standard-equivalent minute.
- Two-person HD media: 2 × $3.99/1,000 = **$0.00798 per connected call minute**. Model all included ordinary minutes as HD, not the cheaper audio rate.
- Translated call media is already included in total call minutes; do not add it twice.
- Text translation conservative request allocation: $89.95/20,000 = $0.0044975 per request. This is full-utilization allocation for one Khaya Standard package, not automatic metered overage permission.
- Storage: $0.0213/GB-month marginal assumption; bandwidth/egress beyond included platform allocations remains a separate exposure.
- Add 15% contingency and 1.95% payment processing.
- Modeled contribution margins are approximately 59–63% monthly and 56–59% annually, before shared hosting, support, taxes and additional egress.
- Larger groups, recording, high resolutions, extra seats and unusually high egress need their own funded limits/quotes.

## Proposed additional purchases

These are new/revised products, **not a claim that each is implemented today**.

| Product | Proposed USD price |
|---|---:|
| 100 ordinary two-person audio/HD call minutes | 2.99 |
| 500 ordinary call minutes | 12.99 |
| 1,500 ordinary call minutes | 34.99 |
| 10 standard-equivalent Langpretation minutes | 2.99 |
| 40 standard-equivalent Langpretation minutes | 9.99 |
| 100 standard-equivalent Langpretation minutes | 24.99 |
| 300 text translations, up to 20,000 source characters | 4.99 |
| 1,000 text translations, up to 75,000 source characters | 14.99 |
| 50 Malvi voice-only minutes | 4.99 |
| 10 Malvi avatar minutes | 4.99 |

Proposed pack validity is 30 days, disclosed before purchase. Do not change the expiry or value of existing purchased packs or wallet credit.

Nanivio credit top-ups purchase service credit at the quoted value; they are not a separate subscription and do not generate free minutes. Received P2P credit is an alternative source of payment, not a bank transfer or cash wallet. No charge merely for receiving a P2P credit-funded purchase should be invented.

Keep Paystack, USDT and received-Nanivio-credit payment choices separate. Credit top-ups cannot be paid from the same credit balance being topped up. Direct USDT still has potential network, verification/API and conversion costs; do not advertise it as cost-free or charge a hidden surcharge.

Human expert consultations and negotiated corporate work should retain their explicit service quote. AI subscription pricing must not imply free doctor/legal services, certified human translations or professional accreditation.

## Annual subscriptions and existing customers

Annual prices assume **12 monthly allowance allocations**, not one month's allowance for an entire year. Enforce this consistently for Paystack, USDT, wallet credit, admin adjustments, cancellations and interrupted/retried payment delivery before publishing annual offers. Do not assume the checkout quote's 365-day period establishes monthly replenishment.

Limits and price snapshots for existing paid purchases must remain intact. Clearly disclose new renewal prices and limits and obtain any required acceptance. Never refill an unpaid trial, reset usage by switching billing cycle, or retroactively reprice an activated purchase.

## Scale and cash-flow checks

Public provider packages are shared across Nanivio, not supplied separately to every customer. Khaya Standard's 20,000 requests and 100 requests/minute are application-wide constraints. Subscriptions sold to users must not multiply that provider quota.

Example platform/provider minimums:

- Stream Chat paid monthly plan: $499 (its free/grant/account-specific arrangement may differ).
- Supabase Pro: $25 starting subscription.
- Render example server: $25; Redis/key-value: $10 scenario assumption, not a verified account bill.
- LiveAvatar Essential: $99.
- Khaya Standard: $89.95.
- Illustrative total: **$747.95/month**, before other services, overages, tax, staff or support.

This is not Nanivio's verified spend. At only 100 paying customers it would be roughly $7.48 of minimum cash spend per payer before additional charges, and free active users still create costs. A grant/free-tier launch and a paid-provider deployment have different break-even points.

For a fleet cash forecast, count provider package subscription charges once and use their included usage before adding overages. **Do not add the full package fee to a per-unit allocation of that same included usage and call the result an actual bill.** Contributions above are conservative unit-cost scenarios; calculate actual break-even from a non-double-counted fleet bill, customer mix and usage.

## Publication gates

1. Owner approves actual prices and allowances, not only this direction.
2. Verify selected Malvi voice/brain and current supplier package terms without exposing keys.
3. Implement versioned communication and Malvi catalogues, request/character limits, voice-note/live usage normalization, storage limits and distinct pack fulfillment.
4. Preserve purchased snapshots and prove 12 annual allocations without free refills or duplicate delivery.
5. Connect administrator editing to the authoritative quotes and customer displays across all payment methods.
6. Test full-allowance, retry, simultaneous usage, changed-catalogue, insufficient-credit and renewal cases. Reconcile a representative provider usage sample; this report made no paid provider calls.
7. Obtain separate release approval; no live catalogue publication or Git push is authorized by drafting these prices.

## Official public sources

- LiveAvatar: https://help.heygen.com/en/articles/10035615-how-to-get-started-with-liveavatar
- Gemini: https://ai.google.dev/gemini-api/docs/pricing
- ElevenLabs: https://elevenlabs.io/pricing/api
- Palabra: https://www.palabra.ai/pricing
- Khaya: https://developer.khaya.ai/products
- Agora: https://www.agora.io/en/pricing/video-calling/
- Paystack Ghana: https://paystack.com/gh/pricing?localeUpdate=true
- Supabase: https://supabase.com/pricing
- Render: https://render.com/pricing
- Stream Chat: https://getstream.io/chat/pricing/

Public list prices are starting assumptions. They do not establish Nanivio's actual account balances, negotiated contracts, tax treatment or available provider quotas.
