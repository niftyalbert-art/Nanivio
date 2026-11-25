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

/** Never reload over a live call or meeting; the failing feature reports its error instead. */
export function hasLiveMedia(doc: Pick<Document, 'querySelectorAll'>) {
  return Array.from(doc.querySelectorAll('audio, video')).some(element => {
    const stream = (element as HTMLMediaElement).srcObject;
    return typeof MediaStream !== 'undefined' && stream instanceof MediaStream
      && stream.getTracks().some(track => track.readyState === 'live');
  });
}

const capturedTracks = new Set<MediaStreamTrack>();

/** Track microphone/camera captures (calls, meetings, Malvi) made through any SDK. */
export function trackMediaCapture(devices: MediaDevices | undefined) {
  if (!devices?.getUserMedia) return;
  const original = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async constraints => {
    const stream = await original(constraints);
    for (const track of stream.getTracks()) {
      capturedTracks.add(track);
      track.addEventListener('ended', () => capturedTracks.delete(track));
    }
    return stream;
  };
}

export const hasLiveCapture = () => [...capturedTracks].some(track => track.readyState === 'live');

export function installStaleChunkReload(target: Window = window) {
  trackMediaCapture(target.navigator.mediaDevices);
  target.addEventListener('vite:preloadError', event => {
    if (hasLiveCapture() || hasLiveMedia(target.document)) return;
    let reload = false;
    try { reload = shouldReloadForStaleChunk(target.sessionStorage); } catch { reload = false; }
    if (!reload) return;
    event.preventDefault();
    target.location.reload();
  });
}
