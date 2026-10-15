---
name: Communication grant periods
description: Free switches preserve usage and terms; paid subscriptions require verified Paystack purchases.
---

## Paid communication purchases

Paid communication tiers must use verified Paystack payment, not the former free allowance selector. A paid purchase can grant a new purchased term; unpaid/free-plan switches must still preserve the existing term and consumption, and independently purchased minute packs remain separate.

**Why:** The user requested working Paystack payments for top-ups, Langpretation, and subscriptions. Treating priced plans as free selections bypasses the intended payment.

**How to apply:** Keep free-plan selection separate from verified external-payment fulfillment. Do not debit a wallet to fulfill an external payment. A one-off term purchase is not a recurring mandate: do not advertise or enable automatic renewal without implementing actual provider-authorized recurring billing.

## Unpaid self-service changes

Unpaid communication plan switches preserve consumed allowance and the original entitlement period, even when changing the displayed billing cycle.

**Why:** Selection collects no payment. Creating a fresh grant on each switch allows unlimited provider-backed translation by alternating tiers or cycles.

**How to apply:** Renew self-service grants only after the existing term expires. Adjust a current term's quota against accumulated consumption, without extending expiry. Keep independently purchased minute packs separate.
