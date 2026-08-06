---
name: stream-chat-react v14 API
description: Breaking changes and correct patterns for stream-chat-react v14 used in Nivio chat
---

## Key breaking changes from v12/v13 → v14

- `MessageInput` is removed — use `MessageComposer` instead
- `ChannelList` has no `Preview` prop — use `renderChannels` for custom list items
- CSS path changed: `stream-chat-react/dist/css/index.css` (NOT `/dist/css/v2/index.css`)
- `ChannelPreviewUIComponentProps` no longer exported — use `ChannelListItemProps` / `ChannelListItemUIProps`

**Why:** Installed v14.10 which has a full component redesign. These names do not exist in v14 and will throw "does not provide an export named X" at runtime.

**How to apply:** Any upgrade or new component using stream-chat-react must use `MessageComposer`, `renderChannels` prop on `ChannelList`, and import CSS from `dist/css/index.css`.

## Stream user custom fields (phone search)

Custom fields upserted via `client.upsertUser({ id, name, phone })` are queryable with `$autocomplete` in `queryUsers`. Phone search is detected by the `/^\+?[0-9]{4,}$/` pattern on the query string and routed to `{ phone: { $autocomplete: q } }`.

## Video SDK CSS

`@stream-io/video-react-sdk/dist/css/styles.css` — correct path confirmed.

## Avatars via Stream user.image
Profile photos are stored on the API server; Stream `user.image` holds a *relative* path (`avatars/<id>?v=ts`) and the client prefixes its API base (`streamAvatarUrl` in chat.tsx). GET /api/avatars/:userId is deliberately public because chat partners load it via plain <img> tags. Base64 upload routes need their own express.json limit (~+33% over binary size) — the global parser is 10mb.

## Component overrides (v14)
- `<Channel>` no longer accepts `Attachment`/component-override props. Wrap children in `<WithComponents overrides={{ Attachment: MyAttachment }}>` inside `<Channel>`.
- Server can post/update messages on behalf of a user (server SDK with API secret); attachment updates propagate live to clients via message.updated.
