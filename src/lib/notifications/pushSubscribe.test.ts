import { describe, expect, it } from 'bun:test';
import { type PushSubscribeDeps, subscribeThisBrowser } from './pushSubscribe';

const SUBSCRIPTION = {
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc',
  expirationTime: null,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
};

function harness(overrides: { permission?: NotificationPermission; saveStatus?: number } = {}) {
  const calls: {
    registered: string[];
    subscribeOptions: PushSubscriptionOptionsInit[];
    posts: Array<{ url: string; init: RequestInit | undefined }>;
  } = { registered: [], subscribeOptions: [], posts: [] };
  const pushManager = {
    subscribe: async (options: PushSubscriptionOptionsInit) => {
      calls.subscribeOptions.push(options);
      return { toJSON: () => SUBSCRIPTION };
    },
  };
  const deps: PushSubscribeDeps = {
    publicKey: 'BVapidPublicKey',
    requestPermission: async () => overrides.permission ?? 'granted',
    serviceWorker: {
      register: (async (url: string) => {
        calls.registered.push(url);
        return { pushManager };
      }) as unknown as ServiceWorkerContainer['register'],
      ready: Promise.resolve({} as ServiceWorkerRegistration),
    },
    fetch: async (url, init) => {
      calls.posts.push({ url, init });
      return new Response(null, { status: overrides.saveStatus ?? 201 });
    },
  };
  return { deps, calls };
}

describe('subscribeThisBrowser', () => {
  it('registers push-sw.js, subscribes under the VAPID key and saves the subscription', async () => {
    const { deps, calls } = harness();
    await subscribeThisBrowser(deps);
    expect(calls.registered).toEqual(['/push-sw.js']);
    expect(calls.subscribeOptions).toEqual([
      { userVisibleOnly: true, applicationServerKey: 'BVapidPublicKey' },
    ]);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.url).toBe('/api/notifications/push-subscriptions');
    expect(calls.posts[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls.posts[0]?.init?.body))).toEqual(SUBSCRIPTION);
  });

  it('stops before touching the service worker when notifications are blocked', async () => {
    const { deps, calls } = harness({ permission: 'denied' });
    await expect(subscribeThisBrowser(deps)).rejects.toThrow('Notifications are blocked');
    expect(calls.registered).toEqual([]);
    expect(calls.posts).toEqual([]);
  });

  it('reports a failed save with its status instead of claiming push is on', async () => {
    const { deps } = harness({ saveStatus: 401 });
    await expect(subscribeThisBrowser(deps)).rejects.toThrow(
      'Saving the subscription failed (401)',
    );
  });
});
