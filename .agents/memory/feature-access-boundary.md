---
name: Feature access boundary
description: Separate user-readable capabilities from privileged administration and loading failures.
---
Ordinary clients must be able to read non-sensitive feature availability without receiving administrator permissions. Keep mutations restricted to authenticated administrators.

**Why:** Administrator-route hardening left ordinary users fetching a forbidden settings endpoint. Their fail-closed defaults then reported that administrators had disabled video calling, even though provider configuration was present.

**How to apply:** Preserve a read-only boolean capability view, refresh it when settings change, and distinguish loading/network errors from an explicit administrator shutdown. Administrative changes must include authentication and only appear saved after server acknowledgment. Provider configuration is not proof of a successful real call.
