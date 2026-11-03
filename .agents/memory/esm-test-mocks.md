---
name: Mixed ESM export test doubles
description: Avoid mistaking an esbuild fixture's default/named import mismatch for a failed provider connection.
---

When a bundled Node test replaces a module used through both default and named imports, preserve both import contracts. For a constructor-default module such as ws, a constructor with attached named exports works; a namespace-shaped object with `__esModule: true` may not.

**Why:** esbuild can emit Node-mode `__toESM(..., 1)`, which treats the entire supplied value as the default export even when `__esModule` is set. A namespace-shaped test double then becomes “not a constructor” before any provider connection opens. That is a test-double failure, not evidence of bad credentials or a provider outage.

**How to apply:** Check module construction and test-substitute import semantics before spending provider credits. Also give virtual frontend modules a resolve directory when they import workspace dependencies.
