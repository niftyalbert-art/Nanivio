/** User-approved Gemini alternative; not a clone of Malvi's ElevenLabs voice. */
export const MALVI_GEMINI_VOICE = 'Sulafat';

export function malviGeminiVoiceDirection(language: string) {
  const accent = language === 'en'
    ? 'While the current selected language is English, speak with a gentle, natural blend of contemporary British English and light Ghanaian English. Keep British-influenced articulation alongside a subtle Ghanaian cadence and warmth; neither accent should be strong or theatrical. If Nanivio changes the language preference, use that language’s natural pronunciation instead; do not retain English phonology or switch it back to English.'
    : 'Keep the selected language and its natural pronunciation. Do not switch to English or force English accent rules onto another language.';
  return `Malvi's approved Gemini speaking style:
${accent}
Use a slightly fuller, deeper, softly resonant voice while staying natural, warm, sweet, engaging and clear, not gravelly or dramatically low. Use a relaxed conversational pace.
Pronounce the brand Nanivio as "Na ni vio": three smoothly connected parts with a clear final vi-o and no inserted y sound. Do not say "nani-viyo".
Keep normal written spelling as Nanivio; these are speaking directions, not text to recite.
Generate clean dry speech. Gentle ambience and echo are added separately before the same audio goes to the avatar. Do not imitate an echo, repeat words, add sound effects, or announce these directions.`;
}
