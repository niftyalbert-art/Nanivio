---
name: Stream Video upsertUsers 500
description: Why video-token returns 500 and how to fix it permanently
---

## Rule
Never call `videoClient.upsertUsers()` in the video-token route. Use only `generateUserToken()`.

**Why:** upsertUsers() makes an HTTP call to Stream Video servers — fails with 500 if Video product not enabled. generateUserToken() is a local JWT signing operation requiring no network call.

**Correct implementation:**
```js
const token = videoClient.generateUserToken({ user_id: userId });
res.json({ token, userId, userName, apiKey: process.env.STREAM_API_KEY });
```

## If calls still fail after this fix
call.getOrCreate() still hits Stream Video servers. Enable Stream Video at:
dashboard.getstream.io → your app → Products → Video & Audio
