# Malvi live brain: provider setup and implementation scope

## Provider design

The live voice bridge supports one server-selected provider for a session:

| Provider | Live audio model | Input | Avatar output |
| --- | --- | --- | --- |
| Gemini Live | `gemini-3.8-live` by default | PCM16 mono, 16 kHz | PCM16 mono, 24 kHz |
| OpenAI GPT-Live | `gpt-live-1` by default | PCM16 mono, 24 kHz (resampled on the server) | PCM16 mono, 24 kHz |

Set `MALVI_BRAIN_PROVIDER` to `gemini` or `openai`. Optional model overrides are `MALVI_GEMINI_LIVE_MODEL` and `MALVI_OPENAI_LIVE_MODEL`; `MALVI_OPENAI_VOICE` changes the OpenAI voice. API credentials are only read by the server from Replit Secrets (`GEMINI_API_KEY` or `OPENAI_API_KEY`) and are never returned by the readiness endpoint.

Only the selected provider receives microphone audio. There is no automatic cross-provider failover or fan-out. The mic remains off until the user turns it on; mic audio is sent over Nanivio's authenticated WebSocket and does not go to HeyGen. The LITE avatar receives only generated PCM16 mono audio at 24 kHz.

## Current integration boundary

The text chat already has a separate Gemini generation path. The LITE session now has a live-audio provider adapter for Gemini and OpenAI, a selected-provider readiness check, authenticated audio routing, explicit mic controls, idle expiry, and 16-to-24 kHz conversion for OpenAI. The live system prompt does not authorize payments, account edits, bookings, or other tools.

This workspace does not currently have the Gemini or OpenAI API credentials, the provisioned custom LiveAvatar ID, or the Redis URL needed for a real provider session. Local tests and builds can verify the adapter code, but a real microphone-to-avatar session cannot be claimed working until those are configured and an end-to-end test is run.

The master prompt contains additional work not included in this voice-bridge phase:

1. Add an approved, versioned Nanivio feature and company-knowledge registry; distinguish live capabilities from planned ones.
2. Add user-owned persistent memory with visible consent, review, edit, and delete controls. Existing browser context snapshots are not persistent server-owned memory.
3. Add plan entitlements and accurate usage accounting before making paid live sessions generally available.
4. Add separately authorized service and account tools, with explicit confirmation for consequential actions.
5. Verify language support against the actual speech and translation adapters before advertising it.

These require their own implementation and verification; the new live voice route does not pretend to provide them.
