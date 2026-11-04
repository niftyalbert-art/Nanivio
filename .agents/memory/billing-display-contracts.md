---
name: Billing display contracts
description: Keep persisted billing data compatible with presentation without inventing financial values.
---
Normalize persisted billing rows at read boundaries before treating them as frontend transaction objects. Keep display formatting tolerant of decimal strings and explicit about unavailable values.

**Why:** Database-shaped transactions and decimal-string amounts reproduced a Billing render failure. Old overview fallbacks also concealed incorrect wallet paths by showing plausible-looking demo balances.

**How to apply:** Preserve actual zero balances, distinguish unknown data from known empty wallets, and never substitute demonstration funds. Presentation adapters must not change ledger values, grant credits, or relax payment authorization. Test both canonical and database-shaped records when changing billing reads.

Exercise the actual Billing meter and active-session banner with decimal strings, not just transaction rows. Also test Account and in-call plan selection whenever payment policy changes: fixing only the Billing hub leaves older entry points calling free activation for paid plans.

**Why:** A server-side paid-plan safeguard exposed missed Account/call selectors, while decimal-string savings and session costs still crashed Billing despite earlier transaction-formatting fixes.

Communication usage displays must use the allowances that admission actually charges. Keep text characters separate from speech minutes, identify active reservations as held usage, and do not assume a cash-valued credit balance enables automatic minute fallback.

**Why:** A general audio activity log can include other products such as Malvi and does not establish which communication allowance was charged. An administrator's current trial default also does not establish an existing user's original trial grant.

**How to apply:** Keep live-trial and paid-plan pools distinguishable. Derive original trial usage from its actual records rather than retroactively applying a changed default. If allowance reads fail, show unavailable rather than zero, active benefits or invented savings.
