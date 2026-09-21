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
// bundle. What must survive that move: it still initializes, once, with autocapture and
// session recording on — a deferred import that never arrives is analytics silently off.
describe('MixpanelInit', () => {
  it('initializes mixpanel once after mount, with autocapture and session recording', async () => {
    const { MixpanelInit } = await import('./MixpanelInit');

    render(<MixpanelInit />);
    render(<MixpanelInit />);

    await waitFor(() => expect(initCalls).toHaveLength(1));
    expect(initCalls[0]?.token).toBe('c4c6970ea649d1a205fbf340cdbb97d7');
    expect(initCalls[0]?.options).toMatchObject({
      autocapture: true,
      record_sessions_percent: 100,
    });
  });
});
