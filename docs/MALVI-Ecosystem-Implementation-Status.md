# Malvi Ecosystem Implementation Status

Implemented in this package:

- Malvi defined as a persistent Nanivio companion rather than only a chatbot.
- Original Free / Basic / Premium / Business plan structure retained from the Nanivio project.
- Server-authoritative Malvi subscription lookup and entitlement context.
- Malvi Business collaboration endpoint gated to an active Malvi Business subscription.
- Paystack Malvi subscription fulfillment derives the plan, price and allowance from the server plan table and rejects mismatched verified amounts.
- Persistent Malvi credit entitlement initialization is idempotent per subscription period.
- Malvi voice replies use the authenticated production TTS endpoint rather than browser speech synthesis.
- Real microphone PCM/WAV capture in the Malvi client and authenticated server transcription endpoint.
- ASR routing: Khaya for Ghanaian/Hausa, Sunbird for Swahili/Luganda, Azure Speech for international languages.
- TTS routing: Khaya for Ghanaian/Hausa, Sunbird for Swahili/Luganda, Azure Speech for international languages.
- All 18 language codes are passed as the selected Malvi speaking language.
- Malvi usage is deducted through the persistent Malvi credit ledger for production voice responses.
- Existing living-motion avatar remains the visual companion renderer, with breathing, blinking, gaze, speaking/listening/thinking states and immersive presentation.

Not falsely claimed as live-tested:

- Provider credentials are not embedded in the package.
- Azure, Khaya and Sunbird endpoints require the user's production credentials/configuration.
- Gemini requires `GEMINI_API_KEY`.
- Supabase migrations must be applied to the production database.
- A full dependency install/build could not be completed in the isolated environment because the npm registry was unreachable and there was no local dependency cache.
- The existing project still contains an unrelated pre-existing TypeScript issue in the admin Langpretation configuration handler; it was corrected by making the handler async and importing `getServerSupabase` in this package.
- A future rigged GLB/real-time facial rig can replace the current living-motion renderer without changing the Malvi API, billing or provider architecture.
