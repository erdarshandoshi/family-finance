/* Family Finance service worker — push notifications only.
   Deliberately does not cache anything: a stale app shell is worse than a network
   round-trip, and caching has bitten this app before. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Family Finance', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Family Finance';
  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'ff-sip',
    renotify: true,
    data: { url: payload.url || '/mf' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an open tab if there is one, otherwise open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/mf';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
