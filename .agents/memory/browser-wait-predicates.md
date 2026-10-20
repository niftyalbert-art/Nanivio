---
name: Browser wait predicates
description: Avoid false failures when CDP evaluates DOM conditions by value.
---
Return explicit booleans from browser wait predicates, particularly selector queries.

**Why:** CDP's by-value serialization of native DOM elements can produce an undefined result even when the element exists. This caused repeated false negatives despite successful SDK attachment in an isolated fixture.

**How to apply:** Use `!!document.querySelector(...)` or another boolean condition, not the raw element. Inspect browser state and recorded actions before attributing a repeated wait failure to product behavior.

Mutation scripts evaluated with `awaitPromise: true` should end with a primitive
such as `true`, not a fixture Proxy returned by `Object.assign`.

**Why:** A fixture Proxy that returns no-op functions for missing properties also
returns one for `then`. Returning that Proxy makes CDP await a thenable that never
resolves, even though the browser and application are responsive.

**How to apply:** End fixture mutation expressions with `; true` or return a plain
serializable result. Do not diagnose such a stalled automation call as an app crash.
