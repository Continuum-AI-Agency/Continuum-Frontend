// Turning Web Push on for this browser: permission, the push service worker, a subscription
// under the VAPID key the Backend signs with, and saving it for the signed-in user. Injectable
// so the whole handshake is testable without a browser; NotificationPreferences passes the
// real navigator/Notification/fetch.

export type PushSubscribeDeps = {
  publicKey: string;
  requestPermission: () => Promise<NotificationPermission>;
  serviceWorker: Pick<ServiceWorkerContainer, 'register' | 'ready'>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
};

export async function subscribeThisBrowser(deps: PushSubscribeDeps): Promise<void> {
  const permission = await deps.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site');
  const registration = await deps.serviceWorker.register('/push-sw.js');
  await deps.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // The Push API takes the VAPID key as base64url text directly.
    applicationServerKey: deps.publicKey,
  });
  const response = await deps.fetch('/api/notifications/push-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error(`Saving the subscription failed (${response.status})`);
}
