---
name: Malvi plan packaging
description: Product direction for grouping Malvi capabilities into billing plans.
---
Malvi features should be grouped and listed in billing plans, progressing from
voice-only access to the most advanced capabilities.

Every advertised plan benefit must correspond to a working capability, not
only pricing-card text. Distinguish implemented workflows from production
verification and from still-missing functionality.

**Why:** The owner explicitly requested implementing the unavailable benefits
promised by each plan and making sure those promises work.

**How to apply:** Preserve purchased terms when changing the catalogue. Do not
call transcript translation simultaneous group speech, a single-user workspace
a shared meeting, or requested AI contributions an autonomous meeting attendee.
Do not certify universal sub-second timing or perfect recall from unit tests.

**Why:** The user requested that “Malvi features should be group and listed for
billing plans right from voice only down to this very advanced” and asked for
suggestions for additional features.

**How to apply:** Present a clear capability and usage-limit comparison.
Distinguish implemented capabilities from future suggestions. The user approved
adding a separate Voice plan while preserving existing plans and purchased
benefits. Prices and allowances still require a provider-cost and quota basis.

Warn users before their Malvi time runs out, not only after exhaustion.
Usage and subscription prompts must use the user's preferred language, not
force English on users who do not understand it.

**Why:** The owner reported that minutes were ending without any advance prompt
and explicitly requested understandable, preferred-language usage messages.

**How to apply:** Keep account-allowance warnings separate from inactivity and
per-session limits. Preserve a clear route to Malvi billing without suggesting
that buying minutes fixes an unrelated connection or provider failure.
Localize the prompt and its action labels together, including right-to-left
presentation where appropriate.

Before pricing, determine all Malvi source usages and quotas.

**Why:** The user corrected the request for guessed plan prices: “First you
should determine all Malvi source usages and the quota that will determine
how much to charge.”

**How to apply:** Separate active/optional providers and public rates from
actual account quotas; never infer remaining balances from configured keys.

Use researched public provider rates as editable starting assumptions for the
admin billing calculator; do not hold that estimate up for private account screenshots.

**Why:** The user said “search them” and then approved building the calculator
using those public rates.

**How to apply:** Label defaults as estimates, keep unknown account balances and
project-specific quotas distinct, and require deliberate administrator review
before using suggested prices for published plans.

Billing prices should default to USD. Users can switch to GHS when needed,
and the system should automatically convert USD billing to GHS. Billing must
be accessible and editable by administrators, including plans added by agents.

**Why:** The user stated Malvi is not only for Ghana and explicitly requested
USD defaults, automatic GHS conversion and administrator editing.

**How to apply:** Use USD as the authoritative price rather than independently
maintained GHS catalogue prices. Preserve existing purchased benefits.

An admin cost calculator alone does not meet the requirement to edit billing
plans: administrators need control of the actual catalogue sold to customers.

**Why:** The user repeated that the billing plans themselves were missing after
the calculator was delivered.

**How to apply:** Keep estimates separate from selling prices and connect approved
published plan changes to customer listings and authoritative purchase quotes.

Runtime usage ceilings need explicit administrator approval; do not turn the
calculator's example scenario or public rates into an assumed provider balance.
Unconfigured paid work must remain unavailable rather than silently unlimited.

**Why:** The user requires costs and quotas to determine billing and wants
administrators to control the offering. Public estimates do not establish the
actual account's allowance or an approved spending budget.

**How to apply:** Keep pricing estimates, purchased entitlements and shared usage
safety caps distinct. Preserve prices and term dates when configuring caps.
An unpaid Free selection is not a new purchase and must not replenish a trial
or replace a paid term.

The user confirmed the three-minute allowance followed by a subscription prompt
is the expected experience.

**Why:** They tested one account and explicitly confirmed the subscription gate
appeared after its three minutes were consumed.

**How to apply:** Preserve the allowance-exhaustion subscription flow. This
confirmation covers the tested account, not every entitlement or payment path;
allowances remain administrator-configurable rather than hardcoded.

## Shared meeting cost and consent boundaries

A shared meeting avatar must use one verified host conference reservation,
not reserve or refund another full allowance for every participant viewing it.
Stopping only the avatar must not refund the host's still-running conference.

**Why:** The same host is already funding the live meeting; double reservation
would reduce purchased usage twice, while refunding the conference on bot exit
would create unbilled meeting time.

**How to apply:** Tie shared renderers to the original verified meeting term.
Recheck owner consent and that term; clean up renderers without settling an
unrelated reservation. Keep paid avatar invitation separate from consent to
transcribe a member's microphone.

Group speech initially uses one common listening language and one stream per
speaker, rather than creating a separate paid stream for every recipient.

**Why:** Per-recipient fan-out multiplies upstream concurrency and costs; an
18-language selector alone does not prove service support, quality or budget.

**How to apply:** Any future individualized group-listening design must review
provider concurrency and funded usage before increasing fan-out. Describe
limited provider probes as probes, not full language-matrix certification.
