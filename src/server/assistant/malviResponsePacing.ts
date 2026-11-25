/**
 * End of the next complete phrase (32–180 characters). Each phrase is voiced as
 * soon as it is transcribed, without a billable TTS request for every word.
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
