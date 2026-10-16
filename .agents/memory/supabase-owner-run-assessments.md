---
name: Supabase owner-run assessments
description: Keep owner-run SQL assessment output accessible in Supabase's SQL editor.
---

Prefer one result set for an owner-run assessment. If a script has multiple
SELECTs, explain how to run each separately before requesting screenshots.

**Why:** During an owner-run assessment, the SQL editor displayed only the final
installation-check result, hiding the cohort counts and causing repeated retries.

**How to apply:** For Supabase assessment handoffs, distinguish query text from
the Results table and ensure the requested aggregate columns are visible. A
Supabase production branch label does not establish that the live app uses it.
