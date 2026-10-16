---
name: Browser wait predicates
description: Avoid false failures when CDP evaluates DOM conditions by value.
---
Return explicit booleans from browser wait predicates, particularly selector queries.

**Why:** CDP's by-value serialization of native DOM elements can produce an undefined result even when the element exists. This caused repeated false negatives despite successful SDK attachment in an isolated fixture.

**How to apply:** Use `!!document.querySelector(...)` or another boolean condition, not the raw element. Inspect browser state and recorded actions before attributing a repeated wait failure to product behavior.
