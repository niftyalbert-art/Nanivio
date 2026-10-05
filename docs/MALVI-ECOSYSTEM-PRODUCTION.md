# Malvi AI Ecosystem — Production Implementation

Malvi is a subscribed Nanivio companion, not a generic chatbot. She provides conversation, teaching, advice, recommendations, Nanivio navigation, eligible service assistance, voice interaction and Business collaboration according to the active Malvi plan.

## Original plan structure preserved

| Plan | Monthly USD | Annual USD | Companion allowance | Key capabilities |
|---|---:|---:|---:|---|
| Malvi Free Experience | 0 | 0 | 3 min | Introductory companion/video trial, basic text Q&A, navigation and language assistance |
| Malvi Basic | 4.99 | 49 | 30 min | Voice companion, basic reasoning, text/task assistance, basic Langpretation |
| Malvi Premium | 14.99 | 149 | 300 min | Human-like interactive avatar, continuous voice, real-time Langpretation, contextual memory, concierge/productivity |
| Malvi Business | 49.99 | 490 | 1,500 min | Team collaboration, live business co-pilot, strategy, meetings, summaries, action items, enterprise knowledge assistance, multi-party Langpretation |

GHS plan values remain the original project values: Free 0; Basic 75/month and 750/year; Premium 220/month and 2,200/year; Business 750/month and 7,500/year.

## Voice architecture

Malvi voice no longer relies on browser `speechSynthesis` for production replies. The client sends real microphone PCM/WAV audio to `/api/malvi/voice/transcribe`. The server routes ASR by language: Khaya for Ghanaian/Hausa, Sunbird for Swahili/Luganda when configured, and Azure Speech for the international ten. Malvi reasoning remains Gemini. Replies are synthesized by the production Langpretation TTS endpoint using Azure, Khaya or Sunbird according to the selected language.

The selected Malvi language is passed end-to-end as the speaking language. Provider credentials are server-only. Missing provider credentials fail closed; no artificial waveform, fabricated transcript or browser voice is presented as production provider output.

## Entitlement and billing

Malvi AI Ecosystem credit is separate from Nanivio credit. Persistent PostgreSQL stores the subscription and credit ledger. An idempotent entitlement reference allocates the plan's companion minutes once per subscription period. Voice responses consume Malvi credit through the persistent ledger. Malvi Business collaboration is server-gated to an active `malvi_business` subscription.

Paystack Malvi subscription fulfillment verifies the selected tier against the authoritative server plan and verified amount before activation. The server derives the plan's companion allowance; client-supplied allowance values are not trusted.

## Avatar

The current Malvi stage uses the existing living-motion avatar system with breathing, blinking, gaze tracking, speaking/listening/thinking states, mouth animation and immersive presentation. This is the visual companion layer and is designed so a future rigged 3D/GLB human avatar can replace the visual renderer without changing Malvi intelligence, billing or voice APIs.

## Required production environment

- `GEMINI_API_KEY`
- `MALVI_MODEL` (current project default: `gemini-3.8-flash`)
- `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` for international speech
- Optional `AZURE_SPEECH_STT_ENDPOINT` for an explicit Speech STT endpoint
- `KHAYA_API_KEY`, `KHAYA_ASR_URL`, `KHAYA_TTS_URL` for Ghanaian/Hausa speech
- `SUNBIRD_API_KEY`, `SUNBIRD_ASR_URL`, `SUNBIRD_TTS_URL` for Swahili/Luganda speech when selected
- Supabase service-role database configuration
- Paystack production configuration for external subscription checkout

## 18 languages

English, French, Spanish, Arabic, German, Italian, Portuguese, Mandarin Chinese, Japanese, Korean, Swahili, Hausa, Twi/Akan, Akuapem Twi, Fante, Ewe, Ga and Luganda.

The UI does not arbitrarily restrict source/target language combinations. Provider routing determines whether a route is direct, pivoted or unavailable.
