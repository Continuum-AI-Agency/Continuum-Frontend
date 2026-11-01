import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Ramiro's decision 1 (PP-DT-C-signout-ends-every-device): Sign out ends THIS browser's session
// only; ending every session of the account is a separate, named action; and a session opened from
// an impersonation link never ends the customer's sessions on their other devices. auth-js signs
// out globally unless told otherwise, so the scope is asserted on every call.

type SignOutScope = 'global' | 'local' | 'others';

// The marker an impersonation link leaves in the browser. Its name is a contract with every
// browser that already holds it, so the test spells it out.
const IMPERSONATION_COOKIE = 'is_impersonating';

type FakeState = {
  signOutCalls: ({ scope?: SignOutScope } | undefined)[];
  signOutError: { message: string } | null;
  cookies: Map<string, string>;
  revalidateCalls: [string, string | undefined][];
  redirects: string[];
};

const state: FakeState = {
  signOutCalls: [],
  signOutError: null,
  cookies: new Map(),
  revalidateCalls: [],
  redirects: [],
};

mock.module('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => {
    state.revalidateCalls.push([path, type]);
  },
}));

mock.module('next/navigation', () => ({
  redirect: (path: string) => {
    state.redirects.push(path);
    throw new Error('NEXT_REDIRECT');
  },
}));

mock.module('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete: (name: string) => {
      state.cookies.delete(name);
    },
  }),
  headers: async () => new Headers({ host: 'app.trycontinuum.ai', 'x-forwarded-proto': 'https' }),
}));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signOut: async (options?: { scope?: SignOutScope }) => {
        state.signOutCalls.push(options);
        return { error: state.signOutError };
      },
    },
  }),
}));

const actions = await import('./actions');

beforeEach(() => {
  state.signOutCalls = [];
  state.signOutError = null;
  state.cookies = new Map();
  state.revalidateCalls = [];
  state.redirects = [];
});

describe('logoutAction (Sign out)', () => {
  it('ends only this browser’s session, then leaves for sign-in', async () => {
    await expect(actions.logoutAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(state.signOutCalls).toEqual([{ scope: 'local' }]);
    expect(state.revalidateCalls).toEqual([['/', 'layout']]);
    expect(state.redirects).toEqual(['/login']);
  });

  it('under an impersonation link, still ends only this browser and drops the marker', async () => {
    state.cookies.set(IMPERSONATION_COOKIE, 'true');

    await expect(actions.logoutAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(state.signOutCalls).toEqual([{ scope: 'local' }]);
    expect(state.cookies.has(IMPERSONATION_COOKIE)).toBe(false);
  });

  it('reports a sign-out that failed and stays on the page', async () => {
    state.signOutError = { message: 'fetch failed' };

    const result = await actions.logoutAction();

    expect(result).toEqual({
      success: false,
      error: 'Network error. Please check your connection and try again',
    });
    expect(state.redirects).toEqual([]);
  });
});

describe('logoutEverywhereAction (Sign out of all devices)', () => {
  it('ends every session of the account, then leaves for sign-in', async () => {
    await expect(actions.logoutEverywhereAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(state.signOutCalls).toEqual([{ scope: 'global' }]);
    expect(state.revalidateCalls).toEqual([['/', 'layout']]);
    expect(state.redirects).toEqual(['/login']);
  });

  it('under an impersonation link, refuses without signing anything out and says why', async () => {
    state.cookies.set(IMPERSONATION_COOKIE, 'true');

    const result = await actions.logoutEverywhereAction();

    expect(result.success).toBe(false);
    const error = result.success ? '' : result.error;
    expect(error).toMatch(/impersonation link/);
    expect(error).toMatch(/Sign out ends only this browser/);
    expect(state.signOutCalls).toEqual([]);
    expect(state.redirects).toEqual([]);
    // The session is still the impersonated one, so it keeps its marker.
    expect(state.cookies.get(IMPERSONATION_COOKIE)).toBe('true');
  });

  it('reports a sign-out that failed and stays on the page', async () => {
    state.signOutError = { message: 'fetch failed' };

    const result = await actions.logoutEverywhereAction();

    expect(result).toEqual({
      success: false,
      error: 'Network error. Please check your connection and try again',
    });
    expect(state.redirects).toEqual([]);
  });
});
