---
name: Browser wait predicates
description: Avoid false failures when CDP evaluates DOM conditions by value.
---
Return explicit booleans from browser wait predicates, particularly selector queries.

Assert rendered fixture text, not the text of inline scripts.

**Why:** A page with an inline compiled app bundle can match UI strings in
document.body.textContent before the corresponding control state is rendered,
allowing tests to pass prematurely or act before a recognizer exists.

**How to apply:** Prefer visible text or a specific rendered component's text for
status assertions; exclude script/style content from both positive and negative
checks. A source-code string is not evidence of visible user feedback.

**Why:** CDP's by-value serialization of native DOM elements can produce an undefined result even when the element exists. This caused repeated false negatives despite successful SDK attachment in an isolated fixture.

**How to apply:** Use `!!document.querySelector(...)` or another boolean condition, not the raw element. Inspect browser state and recorded actions before attributing a repeated wait failure to product behavior. Successful synthetic input-event dispatch is not proof that the browser performed a default action; require evidence of the intended application request or state change.

Mutation scripts evaluated with `awaitPromise: true` should end with a primitive
such as `true`, not a fixture Proxy returned by `Object.assign`.

**Why:** A fixture Proxy that returns no-op functions for missing properties also
returns one for `then`. Returning that Proxy makes CDP await a thenable that never
resolves, even though the browser and application are responsive.

**How to apply:** End fixture mutation expressions with `; true` or return a plain
serializable result. Do not diagnose such a stalled automation call as an app crash.
