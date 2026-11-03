/** Retry only until the brain-start command is actually sent, never after it.
 * A closed/replaced session must not be started by a late socket connection.
 */
export async function sendMalviBrainStart(
  send: (type: string, payload: { sessionId: string; language: string }) => unknown,
  payload: { sessionId: string; language: string },
  isCurrent: () => boolean,
  options: { timeoutMs?: number; pollMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs ?? 10_000);
  while (isCurrent()) {
    if (now() >= deadline) throw new Error('Malvi’s conversation connection could not open. Please check your connection and retry.');
    if (send('malvi:brain_start', payload) === true) return true;
    await sleep(Math.min(options.pollMs ?? 100, Math.max(1, deadline - now())));
  }
  return false;
}
