import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient?.(...args),
}));

import { POST } from './route';

describe('POST /api/organic/ai-studio/compositions', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalUrl: string | undefined;
  let originalAnonKey: string | undefined;
  let originalPublishableKey: string | undefined;

  beforeEach(() => {
    mock.restore();
    originalFetch = globalThis.fetch;
    originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-key';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'publishable-key';
    globalThis.fetch = mock() as unknown as typeof fetch;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = mock().mockResolvedValue({
      auth: {
        getSession: mock().mockResolvedValue({
          data: { session: { access_token: 'session-token' } },
          error: null,
        }),
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (typeof originalUrl === 'undefined') delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (typeof originalAnonKey === 'undefined') delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    if (typeof originalPublishableKey === 'undefined') {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = originalPublishableKey;
    }
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
  });

  it('forwards the session token and payload to the privileged Edge Function', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ composition: { id: 'composition-1' }, revisions: [], clips: [] }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await POST(
      new Request('http://localhost/api/organic/ai-studio/compositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: 'brand-1', draftId: 'draft-1' }),
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/planner-compositions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer session-token',
      apikey: 'publishable-key',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ brandId: 'brand-1', draftId: 'draft-1' }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      composition: { id: 'composition-1' },
      revisions: [],
      clips: [],
    });
  });

  it('does not invoke the Edge Function without a session', async () => {
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = mock().mockResolvedValue({
      auth: { getSession: mock().mockResolvedValue({ data: { session: null }, error: null }) },
    });

    const response = await POST(
      new Request('http://localhost/api/organic/ai-studio/compositions', { method: 'POST' }),
    );

    expect(response.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
