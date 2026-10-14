---
name: Billing payment sources
description: Why wallet and external-payment fulfillment cannot share a payment command.
---
Keep wallet-funded purchases separate from fulfillment of verified external payments.

**Why:** An external-payment fulfillment command assumes payment has already been verified; calling it for a wallet purchase grants value without a wallet debit and creates a false provider-paid record.

**How to apply:** Choose the command from the trusted server route/payment source, not a client field. Test insufficient funds, exact debit, retry idempotency and absence of external payment records using actual PostgreSQL. Exercise Malvi as well as minute packs; SQL compilation alone does not detect JSON operator-precedence errors.
