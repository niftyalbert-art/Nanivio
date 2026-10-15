---
name: Post-merge runtime freshness
description: Verify process freshness after post-merge dependency replacement.
---
Do not treat successful post-merge setup and reconciliation as proof that the application process restarted.

**Why:** Setup reported success while the server process still predated the dependency reinstall. The browser returned Vite “Outdated Optimize Dep” errors until an explicit workflow restart.

**How to apply:** After dependency replacement, verify the actual running preview, not only the setup result. If the process is stale, restart the existing workflow and check the rendered page; do not weaken authentication to make the check pass.
