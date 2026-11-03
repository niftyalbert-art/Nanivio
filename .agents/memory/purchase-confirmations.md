---
name: Purchase confirmations
description: Product and safety rules for receipts after returning from Paystack
---
After Paystack returns to Nanivio, show a clear receipt for the selected purchase and a shortcut to its billing section. Do not treat returning to the dashboard as sufficient confirmation.

**Why:** The user successfully paid by card but could not tell whether the selected subscription had been activated after returning to the dashboard.

**How to apply:** Name the plan from the server-owned original purchase snapshot, not browser state or callback parameters. Show success only after authenticated verification and benefit fulfillment. A pending or failed activation must retain recovery instructions, not encourage another charge. Label purchased allowances separately from remaining usage. Replaying an already-fulfilled payment must not claim a new term, extra minutes, or that an old subscription is currently active.
