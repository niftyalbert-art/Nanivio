---
name: Read-only audit runtimes
description: Avoid unintended runtime configuration changes during observational checks.
---

Prefer the already installed Node.js runtime for small audit and report-validation scripts.

**Why:** Invoking an absent runtime can automatically change the project's Replit configuration, even during an observational audit.

**How to apply:** Check available project runtimes before choosing an audit script language. Prefer an installed runtime when the check does not require another language.
