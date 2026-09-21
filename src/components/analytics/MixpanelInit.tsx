'use client';

import { useEffect } from 'react';

const MIXPANEL_TOKEN = 'c4c6970ea649d1a205fbf340cdbb97d7';

let hasInitialized = false;

/**
 * Analytics is not critical path.
 *
 * `mixpanel-browser` is ~410 KiB. This component mounts in the post-auth layout, so a static
 * import put the whole library in the first-load bundle of all 24 authenticated routes —
 * measured at 420,306 bytes of /library's and /ai-studio's first load, the single largest
 * dependency after zod and Next itself. Importing it inside the effect moves it to its own
 * chunk, which is the same trade `instrumentation-client.ts` already makes for `posthog-js`.
 *
 * Nothing else in the app imports `mixpanel-browser` — autocapture and session recording are
 * the only behaviour, and both begin at `init`. The effect already ran after hydration, so
 * what moves is one chunk fetch, not whether a session is recorded.
 */
export function MixpanelInit() {
  useEffect(() => {
    if (hasInitialized || process.env.NODE_ENV === 'development') return;
    // Claim the guard before awaiting: two mounts in the same tick must not both init.
    hasInitialized = true;

    void import('mixpanel-browser')
      .then(({ default: mixpanel }) => {
        mixpanel.init(MIXPANEL_TOKEN, {
          autocapture: true,
          record_sessions_percent: 100,
        });
      })
      .catch(() => {
        // Analytics failing to load must not take the dashboard down with it. Allow a later
        // mount to retry rather than leaving the session permanently unreported.
        hasInitialized = false;
      });
  }, []);

  return null;
}
