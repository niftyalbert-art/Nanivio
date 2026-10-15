---
name: Billing display contracts
description: Keep persisted billing data compatible with presentation without inventing financial values.
---
Normalize persisted billing rows at read boundaries before treating them as frontend transaction objects. Keep display formatting tolerant of decimal strings and explicit about unavailable values.

**Why:** Database-shaped transactions and decimal-string amounts reproduced a Billing render failure. Old overview fallbacks also concealed incorrect wallet paths by showing plausible-looking demo balances.

**How to apply:** Preserve actual zero balances, distinguish unknown data from known empty wallets, and never substitute demonstration funds. Presentation adapters must not change ledger values, grant credits, or relax payment authorization. Test both canonical and database-shaped records when changing billing reads.

Exercise the actual Billing meter and active-session banner with decimal strings, not just transaction rows. Also test Account and in-call plan selection whenever payment policy changes: fixing only the Billing hub leaves older entry points calling free activation for paid plans.

**Why:** A server-side paid-plan safeguard exposed missed Account/call selectors, while decimal-string savings and session costs still crashed Billing despite earlier transaction-formatting fixes.
