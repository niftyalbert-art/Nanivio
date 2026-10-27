/** Presentation only: preserve diagnostic codes and original server logs. */
export function malviPublicCopy(text: string): string {
  return text
    .replace(/\bGoogle Maps\b/gi, 'Nanivio map')
    .replace(/\bGoogle Search\b/gi, 'Nanivio search')
    .replace(/\b(?:Gemini(?: Live)?|OpenAI(?: GPT-Live)?|ElevenLabs|LiveAvatar(?: LITE)?)\b/gi, 'Nanivio')
    .replace(/\b(?:GEMINI|ELEVENLABS|HEYGEN|OPENAI)_[A-Z_]+\b/g, 'service configuration');
}
