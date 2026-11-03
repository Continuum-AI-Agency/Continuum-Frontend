// PP-DT-C-other-tab-keeps-client-data-after-signout: after the session ended in one tab, the other
// tab kept showing the brand's portfolios and budgets; its reads failed (401) silently and only
// its next navigation reached /login. Sign-out happens on the server, so no browser client is
// told; a tab learns it when a read fails. A failed read in a tab whose session is gone drops
// what the tab holds and leaves for sign-in, back to where it was.

import { describe, expect, it, mock } from 'bun:test';
import { createSessionLossGuard } from './sessionLoss';

const deps = (session: unknown) => ({
  getSession: mock(async () => session),
  clearClientData: mock(() => {}),
  leave: mock((_href: string) => {}),
  currentPath: () => '/scale?tab=performance&optimizerView=portfolios',
});

describe('createSessionLossGuard', () => {
  it('a failed read with no session left drops the client data and goes to sign-in', async () => {
    const d = deps(null);
    const guard = createSessionLossGuard(d);
    await guard.onReadFailed();
    expect(d.clearClientData).toHaveBeenCalledTimes(1);
    expect(d.leave).toHaveBeenCalledWith(
      `/login?redirectTo=${encodeURIComponent('/scale?tab=performance&optimizerView=portfolios')}`,
    );
  });

  it('a failed read with a live session is only a failed read', async () => {
    const d = deps({ access_token: 'jwt' });
    const guard = createSessionLossGuard(d);
    await guard.onReadFailed();
    expect(d.clearClientData).not.toHaveBeenCalled();
    expect(d.leave).not.toHaveBeenCalled();
  });

  it('a session the client could not check (a refresh lost to the network) is not a lost session', async () => {
    // getSession answers no session AND an error when the access token is due and the refresh
    // could not reach the server: that is the network, and the read failed for the same reason.
    const d = deps(undefined);
    const guard = createSessionLossGuard(d);
    await guard.onReadFailed();
    expect(d.clearClientData).not.toHaveBeenCalled();
    expect(d.leave).not.toHaveBeenCalled();
  });

  it('checks once for a burst of failed reads, and leaves once', async () => {
    const d = deps(null);
    const guard = createSessionLossGuard(d);
    await Promise.all([guard.onReadFailed(), guard.onReadFailed(), guard.onReadFailed()]);
    expect(d.getSession).toHaveBeenCalledTimes(1);
    expect(d.leave).toHaveBeenCalledTimes(1);
  });

  it('a signed-out event leaves too, never from the sign-in page itself', async () => {
    const d = deps(null);
    createSessionLossGuard(d).onSignedOut();
    expect(d.leave).toHaveBeenCalledTimes(1);

    const onLogin = { ...deps(null), currentPath: () => '/login' };
    createSessionLossGuard(onLogin).onSignedOut();
    expect(onLogin.leave).not.toHaveBeenCalled();
    expect(onLogin.clearClientData).toHaveBeenCalledTimes(1);
  });
});
