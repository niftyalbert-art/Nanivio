---
name: Stream Chat React v14 mobile layout
description: Why Window and Thread break mobile layout, and the correct fix.
---

# Stream Chat React v14 — Mobile Layout

## The rule
Never use `<Window>` or `<Thread>` inside `<Channel>` on mobile (or at all in this app). Render `<MessageList>` and `<MessageComposer>` directly inside a plain Tailwind flex container.

**Why:** `Window` wraps its children in `.str-chat__main-panel` which has `display:flex; flex-direction:row` — placing the Thread panel beside the message list. `Thread` renders a permanent side panel even when no thread is open, consuming ~30% of the screen width and showing Stream's own empty-state ("Send a message to start the conversation"). CSS overrides (`!important`, media queries) cannot reliably win against Stream's own stylesheet specificity.

**How to apply:** In `artifacts/nifty-pay/src/pages/chat.tsx`, the active channel view uses:
```jsx
<Channel channel={activeChannel}>
  {/* custom header (shrink-0) */}
  <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <MessageList />
    </div>
    <div className="shrink-0 w-full">
      <MessageComposer ... />
    </div>
  </div>
</Channel>
```
`MessageList` and `MessageComposer` only need `Channel` context — `Window` is purely a layout wrapper and is safe to skip.

## Deployment build
The frontend must be rebuilt before publishing. Env vars required:
- `PORT=18638`
- `BASE_PATH=/`

Command: `PORT=18638 BASE_PATH=/ pnpm --filter @workspace/nifty-pay build`

The deployed app serves from `artifacts/nifty-pay/dist/public` (static). Dev-server HMR changes are invisible to the published URL until a rebuild + republish.
