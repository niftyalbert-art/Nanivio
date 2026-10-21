# Malvi voice-only setup checks

The signed-in Malvi controls expose two administrator-only actions:

- **Check Redis connection** calls `POST /api/assistant/diagnostics`. It sends
  Redis `PING`, reports credential configuration separately from live readiness,
  and starts no inference or avatar session. It never returns connection URLs,
  credentials, or raw provider errors.
- **Test voice only** calls `POST /api/assistant/voice-session`. It reserves the
  same Redis-backed session slot and rolling 10-starts/hour allowance used by
  avatar sessions, but does not request a LiveAvatar token or load its SDK.
  Browser playback uses actual backend PCM, not browser speech synthesis.

Voice tests may incur charges from the explicitly selected brain provider.
They remain administrator-only while paid end-user accounting is unfinished.
Microphone capture requires a separate **Start talking** action. Interrupt and
close stop local playback; socket disconnect releases voice-session reservations.
Idle shutdown and the ten-minute hard duration cap apply independently of the
avatar. Language changes never start a second provider session.

Run local lifecycle regressions with:

```sh
node --import tsx --test tests/assistant-live.test.ts
node tests/malvi-brain-language-adapters.mjs
npm run build
node tests/malvi-language-wake-browser.mjs
```

The real Redis regression starts a disposable loopback Redis process. It is not
evidence that Render's Redis service is reachable.

For an explicitly authorized, potentially billable, short real Gemini voice
output probe:

```sh
node --import tsx scripts/malvi-voice-probe.ts --confirm-billable
```

The probe uses no microphone or personal input and starts no avatar. It prints
only sanitized metadata and audio byte counts; it closes after one response or
20 seconds. Successful output does not prove microphone recognition, browser
speaker playback, multilingual accuracy, or avatar lip-sync.

On Render, the administrator connection check runs inside the web service, where
the Key Value internal URL is reachable. That URL is not a usable Replit Redis
connection. These controls must first be released to Render before they can
check the production service.
