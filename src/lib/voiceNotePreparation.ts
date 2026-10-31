/**
 * Upload the sender's original recording while speech processing runs.
 * An upload failure must not discard a successfully paid-for translation.
 * Nothing here publishes a message or retries delivery.
 */
export async function prepareTranslatedVoiceNote<T>(
  originalAudioUrl: string,
  uploadOriginal: ((url: string) => Promise<string>) | undefined,
  translate: () => Promise<T>,
): Promise<{ originalAudioUrl: string; translation: T; uploadFailed: boolean }> {
  const upload = Promise.resolve()
    .then(() => uploadOriginal ? uploadOriginal(originalAudioUrl) : originalAudioUrl)
    .then(
      url => ({ url, failed: false }),
      () => ({ url: originalAudioUrl, failed: true }),
    );
  const [original, translation] = await Promise.all([
    upload,
    Promise.resolve().then(translate),
  ]);
  return { originalAudioUrl: original.url, translation, uploadFailed: original.failed };
}
