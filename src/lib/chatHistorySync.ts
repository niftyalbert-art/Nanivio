/** Durable history repairs missed websocket delivery; never retries a message send. */
export function startChatHistorySync(
  refresh: () => Promise<void>,
  onError: () => void,
  intervalMs = 5000,
) {
  let stopped = false, running = false, queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const run = async () => {
    if (stopped || !visible()) return;
    if (running) { queued = true; return; }
    clearTimeout(timer);
    running = true;
    try { await refresh(); }
    catch { if (!stopped) onError(); }
    finally {
      running = false;
      if (!stopped) {
        timer = setTimeout(() => { void run(); }, queued ? 0 : intervalMs);
        queued = false;
      }
    }
  };
  const wake = () => { void run(); };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wake);
  };
}
