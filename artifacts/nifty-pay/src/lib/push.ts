const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Register the push service worker and subscribe this device to
 * incoming-call notifications. Safe to call multiple times; no-ops when
 * unsupported or permission is denied.
 */
export async function ensurePushSubscription(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    const token = localStorage.getItem('nanivio_token');
    if (!token) return;

    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const base = import.meta.env.BASE_URL; // ends with '/'
    const reg = await navigator.serviceWorker.register(`${base}push-sw.js`, { scope: `${base}push-scope/` });

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch(`${API}/push/vapid-key`, { headers: { Authorization: `Bearer ${token}` } });
      const { publicKey } = await res.json();
      if (!publicKey) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }
    await fetch(`${API}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (err) {
    console.warn('[push] subscription skipped:', err);
  }
}

/**
 * Ask the server to ring the callee's devices.
 * Resolves with the number of devices notified (-1 when the request failed).
 */
export async function notifyCallPush(toUserId: string | number, kind: 'audio' | 'video'): Promise<number> {
  const token = localStorage.getItem('nanivio_token');
  if (!token) return -1;
  try {
    const res = await fetch(`${API}/push/notify-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUserId, kind }),
    });
    if (!res.ok) return -1;
    const data = await res.json();
    return typeof data?.sent === 'number' ? data.sent : -1;
  } catch {
    return -1;
  }
}
