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

Distinguish connection-client configuration failures from invalid user credentials
before requesting replacement secrets.

**Why:** A PostgreSQL URI supplied through `PGDATABASE` was interpreted as a
literal database name on the default host in this environment. That failure did
not mean the supplied URI or its credentials were invalid.

**How to apply:** Validate the URI shape without printing it, then use explicit
libpq connection fields or a connection-string argument. If an error mentions an
unexpected default host, check client parameter handling before asking the user
to regenerate or replace credentials.
