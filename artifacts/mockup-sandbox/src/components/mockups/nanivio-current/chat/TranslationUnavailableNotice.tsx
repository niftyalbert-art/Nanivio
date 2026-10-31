export function TranslationUnavailableNotice({
  state, isMe, viewerLanguage,
}: { state: any; isMe: boolean; viewerLanguage: string }) {
  if (state.translationStatus !== 'unavailable' ||
      (!isMe && state.translationTargetLang && state.translationTargetLang !== viewerLanguage)) return null;
  return (
    <p role="status" className="mt-1.5 border-t border-amber-400/20 pt-1.5 text-xs leading-relaxed text-amber-300">
      Translation unavailable — {isMe ? 'original message only.' : 'showing original message.'}
    </p>
  );
}
