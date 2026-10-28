---
name: Malvi plan packaging
description: Product direction for grouping Malvi capabilities into billing plans.
---
Malvi features should be grouped and listed in billing plans, progressing from
voice-only access to the most advanced capabilities.

**Why:** The user requested that “Malvi features should be group and listed for
billing plans right from voice only down to this very advanced” and asked for
suggestions for additional features.

**How to apply:** Present a clear capability and usage-limit comparison.
Distinguish implemented capabilities from future suggestions. The user approved
adding a separate Voice plan while preserving existing plans and purchased
benefits. Prices and allowances still require a provider-cost and quota basis.

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
