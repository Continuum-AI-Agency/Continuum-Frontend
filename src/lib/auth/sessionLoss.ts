// What an open tab does when its session is gone. Sign-out runs on the server (logoutAction), so
// no browser client of another tab is told, and a session revoked elsewhere is learned the same
// way: by a read that fails. That tab kept rendering the brand's portfolios and budgets while its
// reads 401'd, until its next navigation (PP-DT-C-other-tab-keeps-client-data-after-signout).
// Now a failed read asks whether a session is left — a local read, no network unless the access
// token needs refreshing — and a tab without one drops what it holds and goes to sign-in, back
// to the page it was on. A read that failed with a live session is only a failed read.

export type SessionLossDeps = {
  /** The browser client's current session; null when there is none; undefined when the client
   *  could not tell (a refresh that failed to reach the server is the network, not a sign-out). */
  getSession: () => Promise<unknown>;
  /** Drop every cached read, so nothing of the brand stays on screen. */
  clearClientData: () => void;
  leave: (href: string) => void;
  /** pathname + search of the page the tab is on. */
  currentPath: () => string;
};

export function signInHref(path: string): string {
  return `/login?redirectTo=${encodeURIComponent(path)}`;
}

const onSignInPage = (path: string): boolean => path === '/login' || path.startsWith('/login?');

export function createSessionLossGuard(deps: SessionLossDeps) {
  let check: Promise<void> | null = null;
  let left = false;

  const leaveForSignIn = () => {
    deps.clearClientData();
    const path = deps.currentPath();
    if (left || onSignInPage(path)) return;
    left = true;
    deps.leave(signInHref(path));
  };

  return {
    /** A read failed: if no session is left, the tab leaves for sign-in. One check per burst. */
    onReadFailed(): Promise<void> {
      check ??= deps
        .getSession()
        .then((session) => {
          if (session === null) leaveForSignIn();
        })
        .catch(() => {})
        .finally(() => {
          check = null;
        });
      return check;
    },
    /** The browser client said the session ended. */
    onSignedOut(): void {
      leaveForSignIn();
    },
  };
}
