import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';

const initCalls: Array<{ token: string; options: Record<string, unknown> }> = [];

mock.module('mixpanel-browser', () => ({
  default: {
    init: (token: string, options: Record<string, unknown>) => {
      initCalls.push({ token, options });
    },
  },
}));

afterEach(cleanup);

// The library is imported inside the effect so it stays out of the post-auth first-load
// bundle, and only once the page has loaded and gone idle so it does not compete with the
// page's own first reads. What must survive both moves: it still initializes, once, with
// autocapture and session recording on — a deferred import that never arrives is analytics
// silently off.
describe('MixpanelInit', () => {
  it('waits for load and idle, then initializes once with autocapture and session recording', async () => {
    const idle: Array<() => void> = [];
    const original = window.requestIdleCallback;
    window.requestIdleCallback = ((callback: IdleRequestCallback) => {
      idle.push(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
      return idle.length;
    }) as typeof window.requestIdleCallback;

    try {
      const { MixpanelInit } = await import('./MixpanelInit');

      render(<MixpanelInit />);
      render(<MixpanelInit />);
      window.dispatchEvent(new Event('load'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(initCalls).toHaveLength(0);

      for (const run of idle) run();

      await waitFor(() => expect(initCalls).toHaveLength(1));
      expect(initCalls[0]?.token).toBe('c4c6970ea649d1a205fbf340cdbb97d7');
      expect(initCalls[0]?.options).toMatchObject({
        autocapture: true,
        record_sessions_percent: 100,
      });
    } finally {
      window.requestIdleCallback = original;
    }
  });
});
