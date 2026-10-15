---
name: Development watcher noise
description: Preventing workspace tooling activity from interrupting browser and call tests.
---
Exclude workspace tooling logs, agent metadata, and generated verification
evidence from development-server watching.

**Why:** Workspace workflow-log writes triggered full-page reloads during live
browser verification. This interrupted device enumeration and missed-call
handling even without an application source change.

**How to apply:** Preserve these exclusions when changing development-server
configuration. If a signed-in test unexpectedly navigates or loses its call,
check reload messages for generated paths before treating it as an application
regression. Do not hide the interrupted run or count it as successful evidence.

Runtime-managed environment-cache writes can also reload the app without an
application edit. These are tooling activity, not a reason to restart a call
or evidence of a provider failure.
