import { beforeAll, describe, expect, it, mock } from 'bun:test';

// mock.module is process-wide, so the auth-gate coverage lives in its own file
// rather than alongside the pure matcher assertions in proxy.test.ts.

let claims: { sub?: string } | null = null;

mock.module('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: claims ? { claims } : null, error: null }),
    },
  }),
}));

const { proxy } = await import('./proxy');
const { NextRequest } = await import('next/server');

function request(pathname: string) {
  return new NextRequest(new URL(pathname, 'https://app.trycontinuum.ai'));
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'sb_publishable_test';
});

describe('proxy auth gate', () => {
  it('redirects an anonymous visitor away from a protected route', async () => {
    claims = null;
    const response = await proxy(request('/dashboard'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirectTo')).toBe('/dashboard');
  });

  it('lets an authenticated visitor through to a protected route', async () => {
    claims = { sub: '00000000-0000-0000-0000-000000000001' };
    const response = await proxy(request('/dashboard'));

    expect(response.headers.get('location')).toBeNull();
  });

  it('bounces an authenticated visitor off the login page', async () => {
    claims = { sub: '00000000-0000-0000-0000-000000000001' };
    const response = await proxy(request('/login'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/dashboard');
  });

  it('treats a claims payload without sub as anonymous', async () => {
    claims = {};
    const response = await proxy(request('/dashboard'));

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login');
  });
});
