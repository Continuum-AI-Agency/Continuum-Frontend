import { describe, expect, it } from 'bun:test';
import { DEFAULT_COOKIE_OPTIONS } from '@supabase/ssr';
import * as impersonation from './impersonation';

// The impersonation marker must last exactly as long as the session it marks: @supabase/ssr writes
// the auth cookie with DEFAULT_COOKIE_OPTIONS.maxAge, and only a sign-out ends either. An hour-long
// marker left an impersonated session unmarked for the rest of its life
// (PP-DT-C-signout-ends-every-device, Ramiro's decision 1).

function cookieStore(cookies: Record<string, string>) {
  return {
    get: (name: string) => (name in cookies ? { value: cookies[name] ?? '' } : undefined),
  };
}

describe('markImpersonatedSession', () => {
  it('writes the marker site-wide for as long as the session cookie lives', () => {
    const target = { cookie: '' };

    impersonation.markImpersonatedSession(target);

    expect(target.cookie).toBe(
      `is_impersonating=true; Path=/; Max-Age=${DEFAULT_COOKIE_OPTIONS.maxAge}; SameSite=lax`,
    );
  });
});

describe('isImpersonationMarked', () => {
  it('reads the marker', () => {
    expect(impersonation.isImpersonationMarked(cookieStore({ is_impersonating: 'true' }))).toBe(
      true,
    );
  });

  it('fails closed on a marker with an unexpected value', () => {
    expect(impersonation.isImpersonationMarked(cookieStore({ is_impersonating: '1' }))).toBe(true);
  });

  it('is unmarked without the cookie, or once it was cleared', () => {
    expect(impersonation.isImpersonationMarked(cookieStore({}))).toBe(false);
    expect(impersonation.isImpersonationMarked(cookieStore({ is_impersonating: '' }))).toBe(false);
  });
});
