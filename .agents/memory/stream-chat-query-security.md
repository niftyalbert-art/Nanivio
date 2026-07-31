---
name: Stream Chat queryChannels security
description: Correct filter pattern for queryChannels to avoid server-side security rejection
---

## Rule
Always put the current user's own ID in `members: { $in: [...] }`, then filter client-side for matches.

**Why:** Stream rejects or returns wrong results when you filter by a third party's ID alone. Server-side security enforces that you can only see channels you have access to.

**How to apply:**
```js
const raw = await chatClient.queryChannels(
  { type: 'messaging', members: { $in: [currentUserId] } },
  [{ last_message_at: -1 }],
  { limit: 50, state: true },
);
const channels = Array.isArray(raw) ? raw : (raw as any)?.channels ?? [];
const match = channels.find(ch =>
  inviteeIds.every(id => Object.keys(ch.state.members ?? {}).includes(id))
);
```
