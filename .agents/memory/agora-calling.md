---
name: Agora calling migration
description: How calling works after migrating off Stream Video to Agora RTC
---
- Calls run on Agora RTC (`agora-rtc-sdk-ng`); chat stays on Stream. Signaling (call_invite/accept/reject/end/cancel) is relayed server-side via `POST /api/agora/signal` → Stream `sendUserCustomEvent`, received on the chat websocket.
- **Why:** Stream Video repeatedly failed on real devices; user explicitly requested Agora. Client custom events avoid needing Stream Video at all.
- Replit package firewall blocks `@agora-js/media@4.24.7` (403). Pin `agora-rtc-sdk-ng` to **4.23.4** (allowed). Check tarball with curl against package-firewall.replit.local before bumping.
- Token route `GET /api/agora/token` needs secrets AGORA_APP_ID + AGORA_APP_CERTIFICATE.
- Stream strips reserved keys (notably `channel`) from custom user event payloads — send the call channel as `callChannel`. Verified empirically with a throwaway ws client.
- E2E tested (ring, decline, accept, timers, end) via testing agent; headless DEVICE_NOT_FOUND mic/cam warnings are expected and tolerated.
