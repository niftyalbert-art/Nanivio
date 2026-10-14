---
name: Preview proxy checks
description: Distinguish workspace proxy responses from application health.
---

A shell request to the development domain can return HTTP 426 even while the managed workflow and the app-preview browser work normally.

**Why:** The workspace proxy returned 426 during provider setup, while the mobile preview loaded and direct application health and authentication checks returned their expected responses.

**How to apply:** Cross-check workflow logs and the app preview before treating a development-domain response as an application failure. A direct local API check can isolate the server, but it does not establish public reachability. Do not weaken authentication or change production settings to fix an unconfirmed workspace proxy issue.
