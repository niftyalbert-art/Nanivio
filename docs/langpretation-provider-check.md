# Limited Langpretation check — 2026-10-21 UTC

These checks ran in the development workspace, not on Render. They supersede
the older timeout observations for the exact operations below; they do not
certify all languages or language accuracy.

The owner authorized one short request per stage per existing provider, without
automatic retries. Five provider requests were made. No accounts, microphone
recordings, Malvi sessions, or production balances were used or changed.
Provider charges may apply; this did not exercise application billing.

| Provider | Operation | Result |
| --- | --- | --- |
| Khaya | English → Twi text, “Good morning.” | Nonempty, changed translation; 1.47 seconds |
| Khaya | Twi synthesis, “Maakye.” | 26,682 audio bytes; measured WAV duration 0.416 seconds; 1.01 seconds |
| Khaya | Recognition of that genuine generated WAV | Nonempty transcript; 1.33 seconds |
| Sunbird | English → Luganda text, “Good morning.” | Nonempty, changed translation; 5.01 seconds |
| Sunbird | Luganda synthesis, “Wasuze otya?” | Request failed or timed out within the configured 20-second request bound |
| Sunbird | Luganda recognition | Not requested: no valid generated WAV sample was available |

The Sunbird translation adapter explicitly corrected the configured official
non-translation endpoint to the official text-translation operation.

No human assessed the translation or transcript, listened to the audio, or
completed a two-device call. Generated-audio recognition is not evidence of
physical microphone capture. The synthesis phrase was fixed rather than taken
from the MT result: these are isolated stage checks, not a complete round trip.
No cause such as quota exhaustion or invalid credentials is inferred from a
timeout.

## Chat change

When the primary chat translation attempt fails or returns empty output, the
original can still be sent with “Translation unavailable” attached. The sender
and intended-language recipient see the warning; it survives private message
history restoration. Disabled translation and same-language messages have no
failure warning. Successful translation has no failure warning.

## Next checks

- Diagnose Sunbird synthesis before trying a new provider or increasing timeouts.
- Use a separately authorized genuine Luganda WAV sample for recognition.
- Verify English ↔ Twi through the actual call pipeline on two physical devices.
- Configure and verify Azure before approving its international routes.
- Continue verification across all 18 languages and cross-provider routes.

Re-running `scripts/probe-langpretation.ts --confirm-billable` performs new
potentially billable calls; it is not part of the automatic test suite.
