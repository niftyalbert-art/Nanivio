---
name: Unconfigured development preview
description: Safe behavior when the development workspace lacks the existing Supabase backend.
---
An unconfigured development workspace may show setup instructions, but must not
serve normal APIs, authenticate against temporary accounts, or run financial
operations against in-memory state. Production must still refuse startup.

**Why:** Missing provider secrets previously prevented any preview from loading.
A useful setup screen addresses that development failure without making
unconfigured financial or calling functionality appear operational.

**How to apply:** Keep setup-only serving isolated from normal application
handlers. Do not treat its mobile screenshot or successful startup as evidence
of signed-in layouts or real-provider operation.

The user states: "Malvi-production-upgrade is already connected with supabase and Agora."

**Why:** A task workspace's missing configuration was mistaken for the original
upgrade lacking those connections.

**How to apply:** Distinguish the inspected task copy from the user's configured
project or deployment. Check the existing environment before recommending a new
provider setup; missing credentials in this copy do not disprove that connection.
