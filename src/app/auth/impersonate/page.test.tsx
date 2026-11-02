import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';

// /auth/impersonate is where an impersonation link lands (supabase/functions/impersonate-user,
// generateLink → redirectTo). The admin API's magic link lands with the session in the URL hash, so
// that landing must mark the session as impersonated, as the ?code= landing's callback does: the
// marker is what keeps Sign out of all devices from ending the customer's other sessions
// (PP-DT-C-signout-ends-every-device, Ramiro's decision 1).

const markedAtNavigation: boolean[] = [];
const replace = mock((_href: string) => {
  markedAtNavigation.push(marked());
});
const router = { replace, push: mock((_href: string) => {}) };

// Spread the real module: a mock that drops exports breaks every later file that imports them.
const navigation = await import('next/navigation');
mock.module('next/navigation', () => ({ ...navigation, useRouter: () => router }));

type SessionResult = {
  data: { session: { user: { id: string } } | null };
  error: { message: string } | null;
};

const SIGNED_IN: SessionResult = { data: { session: { user: { id: 'customer' } } }, error: null };
const NO_SESSION: SessionResult = { data: { session: null }, error: null };

let setSessionResult: SessionResult = SIGNED_IN;
let getSessionResult: SessionResult = NO_SESSION;
const setSession = mock(async (_tokens: { access_token: string; refresh_token: string }) => {
  return setSessionResult;
});
const supabase = {
  auth: {
    setSession,
    getSession: async () => getSessionResult,
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};

mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => supabase }));

const { default: ImpersonatePage } = await import('./page');

function marked(): boolean {
  return document.cookie.split('; ').includes('is_impersonating=true');
}

function clearMarker(): void {
  document.cookie = 'is_impersonating=; Max-Age=0; Path=/';
}

function landOn(url: string): void {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  clearMarker();
  markedAtNavigation.length = 0;
  replace.mockClear();
  setSession.mockClear();
  setSessionResult = SIGNED_IN;
  getSessionResult = NO_SESSION;
});

afterEach(() => {
  cleanup();
  clearMarker();
  landOn('/');
});

describe('ImpersonatePage', () => {
  it('marks the session a hash link signs in, before leaving for the dashboard', async () => {
    landOn('/auth/impersonate#access_token=at-1&refresh_token=rt-1&token_type=bearer');

    render(<ImpersonatePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(markedAtNavigation).toEqual([true]);
  });

  it('leaves no marker when the link’s session is refused', async () => {
    setSessionResult = { data: { session: null }, error: { message: 'Invalid Refresh Token' } };
    landOn('/auth/impersonate#access_token=at-1&refresh_token=rt-1&token_type=bearer');

    const view = render(<ImpersonatePage />);

    expect(await view.findByText('Authentication Failed')).toBeTruthy();
    expect(marked()).toBe(false);
  });

  it('does not mark a session this browser already had', async () => {
    getSessionResult = SIGNED_IN;
    landOn('/auth/impersonate');

    render(<ImpersonatePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(setSession).not.toHaveBeenCalled();
    expect(marked()).toBe(false);
  });

  it('hands a ?code= link to the callback, which marks the session on the server', async () => {
    landOn('/auth/impersonate?code=abc');

    render(<ImpersonatePage />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        '/auth/callback?code=abc&next=/dashboard&impersonate=true',
      ),
    );
    expect(setSession).not.toHaveBeenCalled();
  });
});
