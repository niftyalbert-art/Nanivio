---
name: External production hosting
description: Render is the user's live host; distinguish its settings from this Replit task workspace.
---

The user identified Render as the host of their deployed app. A missing Replit
deployment does not establish that this app has no live deployment.

**Why:** During staging setup, the user reported a deployment failure on Render.
Inspecting only this fork's deployment status would not diagnose that service.

**How to apply:** Use redacted logs and setting names from the actual Render
service when diagnosing it. Do not assume a workspace-secret update changes
Render's environment, and do not repurpose the live Supabase project as staging.
