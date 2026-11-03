---
name: Agora package interoperability
description: Node runtime and bundled output can disagree about CommonJS export imports.
---
Validate Agora token imports in the actual Node/tsx runtime, not just the production CJS bundle.

**Why:** A static named import from the CommonJS token package failed at runtime even though the bundled production build passed.

**How to apply:** When changing token dependencies or import style, run the billing audit that imports the realtime/token service as well as the production build.

Verify the installed builder's expiry contract rather than carrying arguments over from legacy Agora examples. AccessToken2 expects relative seconds for both the token and privilege lifetimes.

**Why:** A legacy absolute privilege timestamp can still produce a signed token, so successful signing alone does not establish the intended lease duration.

**How to apply:** Check decoded token and privilege lifetimes using synthetic credentials in addition to runtime imports and build checks. Never log real tokens or certificates.
