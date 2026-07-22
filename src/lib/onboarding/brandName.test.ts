import { describe, expect, it } from 'bun:test';
import { isLikelyLoginTitle, resolveSafeBrandName } from './brandName';

describe('isLikelyLoginTitle', () => {
  it('flags auth/SSO interstitial titles', () => {
    for (const t of [
      'Sign in - Claude',
      'Log in to Google',
      'Sign up',
      'Continue with Apple',
      'Authentication required',
      'OAuth consent',
      'Just a moment...',
      'Redirecting…',
    ]) {
      expect(isLikelyLoginTitle(t)).toBe(true);
    }
  });

  it('does not flag genuine brand titles', () => {
    for (const t of ['Acme Coffee Roasters', 'Pizza Test', 'Nike — Just Do It']) {
      expect(isLikelyLoginTitle(t)).toBe(false);
    }
  });
});

describe('resolveSafeBrandName', () => {
  it('uses a genuine scraped title', () => {
    expect(
      resolveSafeBrandName({ scrapeTitle: 'Acme Coffee', fallbackName: null, url: 'acme.com' }),
    ).toBe('Acme Coffee');
  });

  it('rejects a login title and falls back to the hostname', () => {
    expect(
      resolveSafeBrandName({
        scrapeTitle: 'Sign in - Claude',
        fallbackName: null,
        url: 'https://acme.com/login',
      }),
    ).toBe('acme.com');
  });

  it('rejects a login title but prefers an existing brand name over the hostname', () => {
    expect(
      resolveSafeBrandName({
        scrapeTitle: 'Sign in - Claude',
        fallbackName: 'Acme',
        url: 'acme.com',
      }),
    ).toBe('Acme');
  });

  it('caps an over-long title', () => {
    const long = 'A'.repeat(200);
    expect(
      resolveSafeBrandName({ scrapeTitle: long, fallbackName: null, url: 'x.com' }).length,
    ).toBe(80);
  });

  it('normalizes a bare hostname url without a scheme', () => {
    expect(
      resolveSafeBrandName({ scrapeTitle: '   ', fallbackName: null, url: 'acme.com/path' }),
    ).toBe('acme.com');
  });
});
