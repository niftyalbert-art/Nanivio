/* Nanivio push service worker — rings the device for incoming calls. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  if (data.type !== 'incoming-call') return;
  const kind = data.kind === 'audio' ? 'voice' : 'video';
  event.waitUntil(
    self.registration.showNotification(`Incoming ${kind} call`, {
      body: `${data.callerName || 'Someone'} is calling you on Nanivio`,
      tag: 'nanivio-call',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400, 200, 400],
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // The SW is registered at <appBase>/push-scope/ — the app itself lives one level up.
  const appBase = self.registration.scope.replace(/push-scope\/$/, '');
  const target = appBase + 'chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(appBase) && 'focus' in c) {
          if ('navigate' in c) return c.focus().then(() => c.navigate(target)).catch(() => c.focus());
          return c.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
