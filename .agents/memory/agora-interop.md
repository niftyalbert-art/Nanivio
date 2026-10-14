---
name: Agora package interoperability
description: Node runtime and bundled output can disagree about CommonJS export imports.
---
Validate Agora token imports in the actual Node/tsx runtime, not just the production CJS bundle.

**Why:** A static named import from the CommonJS token package failed at runtime even though the bundled production build passed.

**How to apply:** When changing token dependencies or import style, run the billing audit that imports the realtime/token service as well as the production build.
