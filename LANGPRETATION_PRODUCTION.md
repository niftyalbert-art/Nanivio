# Nanivio Langpretation — Production Upgrade

This version removes the previous synthetic/fake Langpretation path.

## Production media path

1. Browser joins the real Agora RTC channel using a server-generated AccessToken2-style RTC token.
2. Agora publishes the real microphone/camera tracks.
3. Azure Speech SDK handles production browser microphone recognition for Azure-supported launch languages.
4. `/api/translate` routes every requested language pair through Azure Translator, Khaya, or Sunbird, with an English pivot where necessary.
5. `/api/langpretation/synthesize` returns actual provider audio; it no longer creates oscillator/waveform speech.
6. The translated audio is converted into an Agora custom audio track and temporarily published to the remote participant.
7. The original microphone track is restored after the translated utterance finishes.

## 18 x 18 matrix

The authoritative matrix remains 18 x 18 = 324 directed combinations, including self-pairs. All 18 languages are valid source and target selections. A route may be DIRECT or use an internal English pivot; the UI does not remove cross-African combinations merely because the underlying provider uses a pivot.

Languages:

- en English
- fr French
- es Spanish
- ar Arabic
- de German
- it Italian
- pt Portuguese
- zh Mandarin Chinese
- ja Japanese
- ko Korean
- sw Swahili
- ha Hausa
- ak Twi/Akan
- tw-ak Akuapem Twi
- fat Fante
- ee Ewe
- gaa Ga
- lg Luganda

## Required production environment variables

### Agora

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`

Do not use the previous sandbox/mock token behavior. The server now returns an error if production Agora credentials are absent.

### Azure Translator

- `AZURE_TRANSLATOR_KEY`
- `AZURE_TRANSLATOR_REGION`
- `AZURE_TRANSLATOR_ENDPOINT` (normally `https://api.cognitive.microsofttranslator.com`)

### Azure Speech

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

The browser receives a short-lived Azure Speech authorization token from Nanivio; the Speech secret is never sent to the browser.

### Khaya

- `KHAYA_API_KEY`
- `KHAYA_ASR_URL`
- `KHAYA_TTS_URL`

The ASR/TTS URLs must be the exact endpoints shown in the Khaya developer portal for the subscription attached to Nanivio. The code deliberately does not invent an endpoint or generate substitute audio.

### Sunbird

- `SUNBIRD_API_KEY`
- `SUNBIRD_ASR_URL`
- `SUNBIRD_TTS_URL`

Use the exact production ASR/TTS endpoints supplied by the Sunbird subscription.

## Important capability rule

A language pair is present in the 18 x 18 routing matrix even when a direct provider route is unavailable. In that case the router attempts a controlled pivot. A pair is not marked "LIVE VERIFIED" merely because it exists in the matrix. It is marked `NOT VERIFIED` until the actual provider credentials and live provider responses have been tested.

## No longer used for Langpretation

- Palabra
- Gemini as the Langpretation translation fallback
- browser `speechSynthesis` as the call's translated voice
- oscillator/harmonic synthetic speech
- synthetic remote call streams
- mock Agora tokens

Gemini remains available elsewhere in Nanivio where it is used by Malvi or other unrelated application features; it is not part of the production Langpretation routing path.
