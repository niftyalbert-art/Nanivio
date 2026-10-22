/**
 * At most one early phrase, then the final remainder. This avoids waiting for
 * a full native-audio turn without making a billable TTS request for every word.
 */
export function malviOpeningBoundary(text: string): number {
  for (const match of text.matchAll(/[.!?。！？।؟](?:["'”’»])?(?=\s|$)/gu)) {
    const end = match.index! + match[0].length;
    if (end >= 32 && end <= 180) return end;
  }
  if (text.length < 180) return 0;
  const space = text.lastIndexOf(' ', 180);
  return space >= 64 ? space : 0;
}
