---
name: Billing payment sources
description: Why wallet and external-payment fulfillment cannot share a payment command.
---
Keep wallet-funded purchases separate from fulfillment of verified external payments.

**Why:** An external-payment fulfillment command assumes payment has already been verified; calling it for a wallet purchase grants value without a wallet debit and creates a false provider-paid record.

**How to apply:** Choose the command from the trusted server route/payment source, not a client field. Test insufficient funds, exact debit, retry idempotency and absence of external payment records using actual PostgreSQL. Exercise Malvi as well as minute packs; SQL compilation alone does not detect JSON operator-precedence errors.

Real Nanivio benefits must never be granted for Paystack test-mode transactions,
including in the development preview connected to account data.

**Why:** The owner reported subscription success without valid card details.
The existing implementation accepted successful test transactions as purchases;
Render's actual key mode was not independently confirmed. Isolating test
payments is safer than letting sandbox success change real account entitlements.

**How to apply:** Keep payment testing in isolated fixtures until a genuinely
separate sandbox ledger exists. Enforce live mode on both verification and
webhook paths, including Mobile Money. Do not revoke existing customer benefits
without reviewing their payment evidence and obtaining approval.
