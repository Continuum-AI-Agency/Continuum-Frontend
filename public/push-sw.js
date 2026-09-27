// Web Push service worker for Continuum notifications. The Backend delivery worker
// (Continuum-Backend/App/notifications) encrypts a JSON payload {title, body, href, tag};
// this shows it and opens its link on click. Nothing else lives here on purpose: a
// service worker outlives deploys, so it must stay small and dumb.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Continuum', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Continuum';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      data: { href: data.href || '/library' },
      icon: '/ContinuumAI.jpeg',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/library';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client);
      if (open) {
        open.navigate(href);
        return open.focus();
      }
      return self.clients.openWindow(href);
    }),
  );
});
