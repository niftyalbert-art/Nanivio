---
name: Stream Chat React v14 mobile layout
description: How to override Channel's container class and fix the mobile flex-row layout issue.
---

# Stream Chat React v14 — Mobile Layout

## The rule
Use `customClasses.channel` on `<Chat>` to override the Channel container class. Do NOT use `className` on `<Channel>` — it is silently ignored. Do NOT fight Stream's CSS with media-query overrides — specificity always loses.

**Why:** `Channel` reads its container div's classname from `customClasses?.channel` provided to the `<Chat>` context provider (`useChannelContainerClasses` hook in the bundle). Stream's default is `"str-chat__channel"` which has `display:flex; flex-direction:row` — causing the header and message area to render side-by-side on mobile. CSS overrides cannot reliably win against Stream's own stylesheet specificity.

**How to apply:**
```jsx
<Chat
  client={chatClient}
  theme="str-chat__theme-dark"
  customClasses={{
    channel: 'str-chat__channel !flex !flex-col flex-1 min-h-0 overflow-hidden',
  }}
>
```
`!flex` and `!flex-col` use Tailwind's `!important` modifier to force the column layout. Keep `str-chat__channel` in the string so theme CSS variables still apply.

## Never use Window or Thread on mobile
`<Window>` wraps children in `.str-chat__main-panel` (flex-row) and `<Thread>` renders a permanent side panel (~30% width) even when empty — its empty state shows "Send a message to start the conversation". Both components break mobile layout. Remove them; `MessageList` and `MessageComposer` only need `<Channel>` context.

Correct active-channel structure:
```jsx
<Channel channel={activeChannel}>
  <div /* header, shrink-0 */>...</div>
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

## Deployment build — always rebuild before publishing
The deployed app serves `artifacts/nifty-pay/dist/public` (static). Dev-server HMR changes are invisible on the published URL until a rebuild + republish.

Build command (env vars required):
```
PORT=18638 BASE_PATH=/ pnpm --filter @workspace/nifty-pay build
```

## PWA service worker caching
The app registers a service worker (`registerType: 'autoUpdate'`). After republishing, users on mobile may still see the old version. They need to force-close the app/browser and reopen, or clear site data, for the new service worker to activate.
