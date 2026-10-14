---
name: Read-only audit runtimes
description: Avoid unintended runtime configuration changes during observational checks.
---

Prefer the already installed Node.js runtime for small audit and report-validation scripts.

**Why:** Invoking an absent runtime can automatically change the project's Replit configuration, even during an observational audit.

**How to apply:** Check available project runtimes before choosing an audit script language. Prefer an installed runtime when the check does not require another language.

The isolated API execution environment is not the workspace shell; a runtime installed in the workspace is not necessarily available as a subprocess there.

**Why:** Node subprocess validation in the API sandbox had no usable executable path, while the same validation succeeded through the workspace shell callback.

**How to apply:** Run language-runtime checks through the workspace shell tools. When API data needs validation, chain temporary input-file creation with a workspace shell check instead of trying to install or discover another runtime inside the API sandbox.
