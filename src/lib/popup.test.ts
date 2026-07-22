import { afterEach, describe, expect, it } from 'bun:test';

import { OAUTH_BROADCAST_CHANNEL_NAME, waitForOAuthCompletion } from './popup';

// waitForOAuthCompletion races a popup's completion signals (window
// "message" + BroadcastChannel) against the popup being closed. It exists to
// fix a real bug: accounts.google.com sets its own
// `Cross-Origin-Opener-Policy: same-origin`, which permanently severs
// `window.opener` on the popup. When that happens the popup's
// `window.opener.postMessage(...)` silently no-ops, `waitForPopupClosed`
// still detects the popup closing, and the caller used to misreport a
// completed OAuth flow as "Connection cancelled." These tests pin the fix.

type OAuthMsg = {
  type: string;
  provider: string | null;
  context?: string;
  message?: string;
  state?: string | null;
};

function fakePopup(): { closed: boolean } {
  return { closed: false };
}

describe('waitForOAuthCompletion', () => {
  const controllers: AbortController[] = [];

  afterEach(() => {
    // Abort every controller created during the test so the internal
    // waitForPopupMessage/waitForBroadcastMessage listeners and the
    // waitForPopupClosed poll interval are torn down instead of leaking
    // timers into the next test.
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
  });

  function trackedAbortController(): AbortController {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
  }

  it('resolves with the success payload when a postMessage arrives before the popup closes', async () => {
    const popup = fakePopup();
    const abortCtrl = trackedAbortController();
    const predicate = (m: OAuthMsg) => m.provider === 'google' && m.context === 'settings';

    const resultPromise = waitForOAuthCompletion<OAuthMsg>({
      popup: popup as unknown as Window,
      predicate,
      signal: abortCtrl.signal,
      closedGraceMs: 10,
      closedPollIntervalMs: 10,
    });

    window.postMessage(
      { type: 'oauth:success', provider: 'google', context: 'settings' },
      window.location.origin,
    );

    const result = await resultPromise;
    expect(result.type).toBe('oauth:success');
    expect(result.provider).toBe('google');
  });

  it("does not immediately throw 'cancelled' when the popup closes with no completion signal", async () => {
    const popup = fakePopup();
    const abortCtrl = trackedAbortController();
    const predicate = (m: OAuthMsg) => m.provider === 'google';

    const resultPromise = waitForOAuthCompletion<OAuthMsg>({
      popup: popup as unknown as Window,
      predicate,
      signal: abortCtrl.signal,
      closedGraceMs: 60,
      closedPollIntervalMs: 10,
    });
    // Swallow the eventual rejection so it doesn't surface as an unhandled
    // rejection while we're deliberately racing against it below.
    resultPromise.catch(() => {});

    // Simulate the popup closing almost immediately with no message ever
    // posted — this is the COOP scenario the bug report describes.
    setTimeout(() => {
      popup.closed = true;
    }, 10);

    let settled = false;
    resultPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // Popup closes ~10ms in; the grace period (60ms) should still be pending
    // at the 30ms mark, proving "closed" alone did not immediately reject.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);

    // Once the full grace window elapses with no signal, it's a real
    // cancellation.
    await expect(resultPromise).rejects.toThrow('Connection cancelled.');
  });

  it('resolves via BroadcastChannel even when window.opener is null (COOP-severed popup)', async () => {
    const popup = fakePopup();
    (popup as unknown as { opener: null }).opener = null;
    const abortCtrl = trackedAbortController();
    const predicate = (m: OAuthMsg) => m.provider === 'google' && m.state === 'state-abc';

    const resultPromise = waitForOAuthCompletion<OAuthMsg>({
      popup: popup as unknown as Window,
      predicate,
      signal: abortCtrl.signal,
      closedGraceMs: 10,
      closedPollIntervalMs: 10,
    });

    const channel = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL_NAME);
    channel.postMessage({
      type: 'oauth:success',
      provider: 'google',
      context: 'settings',
      state: 'state-abc',
    });
    channel.close();

    const result = await resultPromise;
    expect(result.type).toBe('oauth:success');
    expect(result.state).toBe('state-abc');
  });

  it('resolves with the error payload when an oauth:error signal wins the race', async () => {
    const popup = fakePopup();
    const abortCtrl = trackedAbortController();
    const predicate = (m: OAuthMsg) => m.provider === 'google';

    const resultPromise = waitForOAuthCompletion<OAuthMsg>({
      popup: popup as unknown as Window,
      predicate,
      signal: abortCtrl.signal,
      closedGraceMs: 10,
      closedPollIntervalMs: 10,
    });

    window.postMessage(
      { type: 'oauth:error', provider: 'google', context: 'settings', message: 'denied by user' },
      window.location.origin,
    );

    await expect(resultPromise).rejects.toThrow('denied by user');
  });
});
