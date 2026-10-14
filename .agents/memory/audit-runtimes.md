---
name: Read-only audit runtimes
description: Avoid unintended runtime configuration changes during observational checks.
---

Prefer the already installed Node.js runtime for small audit and report-validation scripts.

**Why:** Running a Python-only report check automatically added a Python module to the Replit configuration even though no application change was intended. The extra module was removed afterward.

**How to apply:** Check available project runtimes before choosing an audit script language. If a check adds an unwanted runtime, remove it through the package-management skill's runtime-uninstallation callback; direct edits to protected Replit configuration are rejected.
