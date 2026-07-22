import { describe, expect, it } from 'bun:test';

import { buildOAuthCallbackUrl, buildOAuthStartUrl } from './oauth';

describe('buildOAuthCallbackUrl', () => {
  it('builds callback url with provider/context/origin parameters', () => {
    const callbackUrl = new URL(
      buildOAuthCallbackUrl('https://app.continuum.test/', 'google', 'login'),
    );

    expect(callbackUrl.pathname).toBe('/callback');
    expect(callbackUrl.searchParams.get('provider')).toBe('google');
    expect(callbackUrl.searchParams.get('context')).toBe('login');
    expect(callbackUrl.searchParams.get('origin')).toBe('https://app.continuum.test');
    expect(callbackUrl.searchParams.get('popup')).toBeNull();
  });

  it('includes popup=true for popup flows', () => {
    const callbackUrl = new URL(
      buildOAuthCallbackUrl('https://app.continuum.test', 'google', 'login', { popup: true }),
    );

    expect(callbackUrl.searchParams.get('popup')).toBe('true');
  });
});

describe('buildOAuthStartUrl', () => {
  it('includes provider/context/origin query parameters', () => {
    const startUrl = new URL(buildOAuthStartUrl('google', 'login'), 'https://example.test');

    expect(startUrl.pathname).toBe('/oauth/start');
    expect(startUrl.searchParams.get('provider')).toBe('google');
    expect(startUrl.searchParams.get('context')).toBe('login');
    expect(startUrl.searchParams.get('origin')).toBe(window.location.origin);
    expect(startUrl.searchParams.get('popup')).toBeNull();
  });

  it('includes popup=true for popup starts', () => {
    const startUrl = new URL(
      buildOAuthStartUrl('google', 'login', { popup: true }),
      'https://example.test',
    );

    expect(startUrl.searchParams.get('popup')).toBe('true');
  });
});
