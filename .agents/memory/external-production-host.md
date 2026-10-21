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

The owner confirmed that the Supabase project named “Malvi nanivio upgrades”
matches the live Render service's `SUPABASE_URL`, after privately comparing them.
This confirmation does not identify the target of workspace credentials or grant
permission to change production accounts.

Keep Malvi’s ElevenLabs transport separate between hosts: use the connected
integration in the Replit development preview and a direct server-side key on Render.

**Why:** A Render-only key should not be required for the preview, and the preview’s
connection does not establish or change Render’s credentials.

**How to apply:** Scope preview transport settings to development. Check configuration
separately from actual speech generation; do not broaden key permissions solely
because an optional metadata endpoint is denied.
