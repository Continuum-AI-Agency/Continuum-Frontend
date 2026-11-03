import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DEFAULT_COOKIE_OPTIONS } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

const mockExchangeCodeForSession = mock(() =>
  Promise.resolve({
    error: null,
  }),
);

const mockCreateSupabaseServerClient = mock(() =>
  Promise.resolve({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
);

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { handleAuthCallbackRequest } from '@/lib/auth/callback-handler';

function createRequest(url: string): NextRequest {
  return {
    url,
    headers: new Headers(),
    cookies: {
      get: () => undefined,
    },
  } as unknown as NextRequest;
}

describe('handleAuthCallbackRequest impersonation', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockClear();
    mockExchangeCodeForSession.mockClear();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it('sets impersonation cookie when impersonate=true is present', async () => {
    const response = await handleAuthCallbackRequest(
      createRequest(
        'https://app.trycontinuum.ai/auth/callback?code=test-code&next=/dashboard&impersonate=true',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get('is_impersonating')?.value).toBe('true');

    const html = await response.text();
    expect(html).toContain('https://app.trycontinuum.ai/dashboard');
  });

  // The marker keeps Sign out of all devices from ending the customer's other sessions, so it
  // lasts as long as the session cookie it marks (only a sign-out ends either), not an hour.
  it('keeps the impersonation cookie as long as the session cookie', async () => {
    const response = await handleAuthCallbackRequest(
      createRequest(
        'https://app.trycontinuum.ai/auth/callback?code=test-code&next=/dashboard&impersonate=true',
      ),
    );

    const marker = response.cookies.get('is_impersonating');
    expect(marker?.maxAge).toBe(DEFAULT_COOKIE_OPTIONS.maxAge);
    expect(marker?.path).toBe('/');
  });

  it('does not set impersonation cookie for normal callbacks', async () => {
    const response = await handleAuthCallbackRequest(
      createRequest('https://app.trycontinuum.ai/auth/callback?code=test-code&next=/dashboard'),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get('is_impersonating')).toBeUndefined();
  });

  it('falls back to dashboard when next points outside the app', async () => {
    const response = await handleAuthCallbackRequest(
      createRequest(
        'https://app.trycontinuum.ai/auth/callback?code=test-code&next=https://evil.example.com/phish',
      ),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('https://app.trycontinuum.ai/dashboard');
    expect(html).not.toContain('evil.example.com');
  });

  it('keeps popup context on the shared /callback route', async () => {
    const response = await handleAuthCallbackRequest(
      createRequest(
        'https://app.beta.trycontinuum.ai/callback?code=test-code&context=login&provider=google&popup=true',
      ),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('"context":"login"');
    expect(html).toContain('"provider":"google"');
    expect(html).toContain('https://app.beta.trycontinuum.ai/dashboard');
  });
});
