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

Malvi payment acceptance must be tested through spendable credit and an actual
live allowance reservation, not just a payment-success response or subscription row.

**Why:** The owner repeatedly reported confirmed payments with no usable minutes.
Recovery UI and gateway-only tests did not establish that the selected term was
credited or that a user could start the purchased service.

**How to apply:** Exercise signed notification, transactional purchase/credit,
invoice, repeat notification after consumption, old-trial cleanup and the next
live reservation together. Keep a missed-webhook recovery path, but do not call
the Render issue fixed before its database migration and deployed flow are checked.

A verified purchase must honor its server-captured checkout terms even if an
administrator later removes or reprices that product.

**Why:** Payment completion and administration are asynchronous. Removing a
minute package after checkout must not leave an already-paying customer with
no deliverable benefit, nor silently substitute the current package's terms.

**How to apply:** Use the original trusted purchase snapshot for quantities,
prices and validity. Consult the current catalogue only for legacy orders that
have no snapshot, with explicit matching checks; never trust client metadata as
the replacement source of purchased rights.
