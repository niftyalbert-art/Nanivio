# Nanivio Mic

Nanivio Mic owns the audio-session engine and authenticated cloud gateway. It
uses the existing selected AI provider for recognition/reasoning and the
approved Malvi speech voice. It is not a newly trained speech model.

## Implemented

- A platform-neutral TypeScript core: capture lifecycle, bounded audio frames,
  speech/silence feedback, delivery receipts, timeouts, cancellation and stop.
- A browser capture adapter using permission-controlled media APIs, **not**
  browser SpeechRecognition. Nanivio's audio processor normalizes hardware
  sample rates into 16 kHz mono PCM16.
- An authenticated gateway on the existing Nanivio application server. It binds
  each stream to the account, socket and live-brain session; serializes and
  bounds pending audio; allows one capture per authenticated socket; and rejects
  stale or reordered frames.
- Malvi's manual conversation microphone uses this engine.

There is no additional service, database migration or provider key to configure.
The cloud gateway runs wherever the existing Nanivio server runs.

## Adapter contract

The core accepts a `NanivioMicCapture` and `NanivioMicTransport`.
Capture adapters emit exactly 3,200 mono PCM16 little-endian samples per frame
(6,400 bytes / 200 ms). A native adapter must normalize the operating system's
capture rate, implement abort/stop, and release the hardware microphone.

The transport must use Nanivio's existing authenticated account/socket flow,
send immediately or return false, and subscribe to `nanivio:mic_status`.
Provider credentials must never be embedded in web or native clients.

1. `nanivio:mic_start`: an existing `sessionId`, a fresh UUID `streamId`,
   `version: 1`, `sampleRate: 16000`, `channels: 1`, `format: "pcm_s16le"`,
   `frameSamples: 3200`.
2. Wait for `nanivio:mic_status` with the same IDs and `state: "ready"`.
3. `nanivio:mic_audio`: the IDs, increasing `sequence` starting at 1, and
   base64 `audio`. Do not queue audio while disconnected or unready.
4. Delivery receipts have `state: "receiving"` and `lastSequence`. These prove
   submission to the selected provider adapter, **not** successful recognition.
   Only actual input-transcription events establish recognized words.
5. `nanivio:mic_stop`: the IDs. End capture immediately, even if the connection
   cannot deliver this command. A stopped stream cannot be resumed/replayed;
   create a new stream ID when the user activates the microphone again.

No mic handshake creates an avatar, brain connection, or billable session.
The existing session's ownership, provider choice, idle and spending limits
continue to apply. Raw audio is neither logged nor persisted by this gateway.

## Boundaries and remaining work

- Browser capture still requires a supported secure page and user permission.
  Background/screen-locked listening is not promised.
- Chrome, Edge, Firefox and Safari are intended browser targets. Chromium
  runtime tests and platform-neutral tests do **not** verify every browser or
  physical phone.
- A native capture adapter/app has **not** been created. The shared engine and
  protocol are its integration contract, not a claim of a released native SDK.
- The existing optional local wake feature remains a separate browser-dependent
  implementation. Replacing it requires an explicitly enabled, independently
  verified on-device model; Nanivio Mic does not silently cloud-stream idle
  wake-word audio.
- Legacy `malvi:brain_audio` remains available for old application clients
  during rollout; new Malvi input uses the owned Nanivio Mic protocol.

## Verification

Run the engine/gateway unit tests, existing Malvi suites, the isolated Malvi
browser fixture, and the real audio-worklet browser test. Provider fixtures and
synthetic audio do not establish live recognition accuracy or physical-device
acceptance. Obtain approval before billable live-provider tests.
