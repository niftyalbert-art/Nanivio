const RELOAD_KEY = 'nanivio_stale_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

/** After a deploy, an open tab can request a code-split file the new build
 * replaced. Reload once so the tab picks up the current build. */
export function shouldReloadForStaleChunk(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()) {
  const last = Number(storage.getItem(RELOAD_KEY) || 0);
  if (now - last < RELOAD_COOLDOWN_MS) return false;
  storage.setItem(RELOAD_KEY, String(now));
  return true;
}

export function installStaleChunkReload(target: Window = window) {
  target.addEventListener('vite:preloadError', event => {
    let reload = false;
    try { reload = shouldReloadForStaleChunk(target.sessionStorage); } catch { reload = false; }
    if (!reload) return;
    event.preventDefault();
    target.location.reload();
  });
}
