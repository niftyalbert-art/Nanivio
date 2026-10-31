import { authenticatedFetch } from '../lib/authenticatedFetch';

/** Wait only for the other participant's call meter to finish starting.
 * Never retry inference, quota denials, configuration errors, or provider work.
 */
export async function waitForCallTranslation(
  callId: string, sourceLang: string, targetLang: string, signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const query = new URLSearchParams({ callId, sourceLang, targetLang });
    const response = await authenticatedFetch(`/api/langpretation/call/readiness?${query}`, { signal });
    const result = await response.json();
    if (response.ok && result.success) return;
    if (response.status !== 425 || result.code !== 'CALL_STARTING' || attempt === 6)
      throw new Error(result.error || 'Langpretation could not start. Please try again.');
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new Error('Langpretation stopped.')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 500);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) { signal.removeEventListener('abort', cancel); cancel(); }
    });
  }
}
