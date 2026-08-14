import { describe, expect, it } from 'bun:test';

import { authedAuthPageDestination } from '@/proxy-config';

const BRAND = 'a90c3556-30a6-4d0d-9a04-1b5c058d05c5';

function search(query: string): URLSearchParams {
  return new URL(`https://app.trycontinuum.ai/login${query}`).searchParams;
}

describe('authedAuthPageDestination', () => {
  it('sends a signed-in user with no invite to the dashboard', () => {
    expect(authedAuthPageDestination(search(''))).toBe('/dashboard');
  });

  it('sends a signed-in user carrying an invite to redemption, not the dashboard', () => {
    expect(authedAuthPageDestination(search(`?token=tok-1&brand=${BRAND}`))).toBe(
      `/invite/callback?token=tok-1&brand=${BRAND}`,
    );
  });

  it('preserves the sign-in handoff through the bounce', () => {
    expect(
      authedAuthPageDestination(search(`?token=tok-1&brand=${BRAND}&otp=hashed&type=magiclink`)),
    ).toBe(`/invite/callback?token=tok-1&brand=${BRAND}&otp=hashed&type=magiclink`);
  });

  it('normalizes the brand id rather than trusting the query string', () => {
    expect(authedAuthPageDestination(search(`?token=tok-1&brand=${BRAND.toUpperCase()}`))).toBe(
      `/invite/callback?token=tok-1&brand=${BRAND}`,
    );
  });

  it('falls back to the dashboard when the invite params are unusable', () => {
    expect(authedAuthPageDestination(search('?token=tok-1'))).toBe('/dashboard');
    expect(authedAuthPageDestination(search(`?brand=${BRAND}`))).toBe('/dashboard');
    expect(authedAuthPageDestination(search('?token=tok-1&brand=not-a-uuid'))).toBe('/dashboard');
  });
});
