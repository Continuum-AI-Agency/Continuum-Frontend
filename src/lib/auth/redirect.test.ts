import { describe, expect, it } from 'bun:test';
import { buildAuthCallbackUrl, resolveAuthRedirectPath } from './redirect';

const SITE = 'https://app.trycontinuum.test';
const INVITE_PATH = '/invite/callback?token=abc123&brand=11111111-1111-4111-8111-111111111111';

describe('buildAuthCallbackUrl', () => {
  it('always sends Supabase to the route that redeems the code', () => {
    // The bug this guards: pointing Supabase at the destination itself delivers a
    // `?code=` to a page that never calls exchangeCodeForSession, so the page sees no
    // session. For /invite/callback that meant bouncing to /login, which mailed
    // another link to the same dead end — invitees never joined the brand.
    const url = new URL(buildAuthCallbackUrl({ siteUrl: SITE, next: INVITE_PATH }));

    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe(INVITE_PATH);
  });

  it('keeps the invite token and brand intact through the nested query string', () => {
    const url = new URL(buildAuthCallbackUrl({ siteUrl: SITE, next: INVITE_PATH }));
    const next = new URL(url.searchParams.get('next') as string, SITE);

    expect(next.searchParams.get('token')).toBe('abc123');
    expect(next.searchParams.get('brand')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('falls back to the dashboard when no destination is requested', () => {
    const url = new URL(buildAuthCallbackUrl({ siteUrl: SITE }));

    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe('/dashboard');
  });

  it('refuses an off-site destination', () => {
    const url = new URL(buildAuthCallbackUrl({ siteUrl: SITE, next: 'https://evil.test/steal' }));

    expect(url.searchParams.get('next')).toBe('/dashboard');
  });

  it('tolerates a trailing slash on the site url', () => {
    const url = new URL(buildAuthCallbackUrl({ siteUrl: `${SITE}/`, next: INVITE_PATH }));

    expect(url.origin).toBe(SITE);
    expect(url.pathname).toBe('/auth/callback');
  });
});

describe('resolveAuthRedirectPath', () => {
  it('allows the invite callback path', () => {
    expect(resolveAuthRedirectPath({ requestedRedirect: INVITE_PATH, siteUrl: SITE })).toBe(
      INVITE_PATH,
    );
  });

  it('rejects protocol-relative and internal paths', () => {
    expect(resolveAuthRedirectPath({ requestedRedirect: '//evil.test', siteUrl: SITE })).toBe(
      '/dashboard',
    );
    expect(resolveAuthRedirectPath({ requestedRedirect: '/api/secret', siteUrl: SITE })).toBe(
      '/dashboard',
    );
  });
});
