import { beforeEach, describe, expect, it, mock } from 'bun:test';

const state = {
  signedIn: false,
  claimsReads: 0,
  authError: null as { name: string } | null,
  saveError: null as { message: string } | null,
  saves: [] as unknown[],
  cookies: [] as unknown[],
};
mock.module('next-intl/server', () => ({
  getTranslations: async () => () => 'Could not save language',
}));
mock.module('@/i18n/server', () => ({
  getCookieLocale: async () => 'en',
  setLocaleCookie: async (value: unknown) => {
    state.cookies.push(value);
  },
}));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => {
        state.claimsReads++;
        return {
          data: { claims: state.signedIn ? { sub: 'user-1' } : null },
          error: state.authError,
        };
      },
      updateUser: async (input: unknown) => {
        state.saves.push(input);
        return { error: state.saveError };
      },
    },
  }),
}));
const { setUiLocaleAction } = await import('./actions');
beforeEach(() => {
  state.signedIn = false;
  state.claimsReads = 0;
  state.authError = null;
  state.saveError = null;
  state.saves = [];
  state.cookies = [];
});

describe('UI language preference', () => {
  it('stores an anonymous browser preference without changing account data', async () => {
    expect(await setUiLocaleAction('pt-BR', 'browser')).toEqual({ success: true });
    expect(state.cookies).toEqual(['pt-BR']);
    expect(state.claimsReads).toBe(0);
    expect(state.saves).toEqual([]);
  });
  it('validates the locale before writing a cookie or account metadata', async () => {
    expect((await setUiLocaleAction('pt', 'browser')).success).toBe(false);
    expect((await setUiLocaleAction({ locale: 'es' }, 'browser')).success).toBe(false);
    expect(state.cookies).toEqual([]);
    expect(state.saves).toEqual([]);
  });
  it('updates only the authenticated account locale before committing the browser preference', async () => {
    state.signedIn = true;
    expect(await setUiLocaleAction('es', 'account')).toEqual({ success: true });
    expect(state.saves).toEqual([{ data: { ui_locale: 'es' } }]);
    expect(state.cookies).toEqual(['es']);
  });
  it('preserves the current browser language when account persistence fails', async () => {
    state.signedIn = true;
    state.saveError = { message: 'provider detail' };
    expect(await setUiLocaleAction('es', 'account')).toEqual({
      success: false,
      error: 'Could not save language',
    });
    expect(state.cookies).toEqual([]);
  });
  it('preserves account language after the session expires', async () => {
    state.authError = { name: 'AuthSessionMissingError' };
    expect((await setUiLocaleAction('es', 'account')).success).toBe(false);
    expect(state.cookies).toEqual([]);
    expect(state.saves).toEqual([]);
  });
  it('rejects an account preference without a current account', async () => {
    expect((await setUiLocaleAction('es', 'account')).success).toBe(false);
    expect(state.cookies).toEqual([]);
  });
  it('does not treat a claims verification failure as an anonymous session', async () => {
    state.authError = { name: 'AuthInvalidJwtError' };
    expect((await setUiLocaleAction('es', 'account')).success).toBe(false);
    expect(state.cookies).toEqual([]);
    expect(state.saves).toEqual([]);
  });
});
