import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));
const mockAfter = mock((callback: () => void | Promise<void>) => {
  void callback();
});

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

mock.module('next/server', () => ({
  after: mockAfter,
}));

mock.module('server-only', () => ({}));

import { setActiveBrandPreference } from '@/lib/brands/preferences';

describe('setActiveBrandPreference', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
    mockAfter.mockClear();
  });

  it('throws when brand id is missing', async () => {
    await expect(setActiveBrandPreference('')).rejects.toThrow('Brand id is required');
  });

  it('throws when user is unauthenticated', async () => {
    const supabase = {
      auth: {
        getSession: mock(() => Promise.resolve({ data: { session: null }, error: null })),
        getClaims: mock(() => Promise.resolve({ data: { claims: null }, error: null })),
      },
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(setActiveBrandPreference('brand-1')).rejects.toThrow('Not authenticated');
  });

  it('uses claims identity when the session cookie has no embedded user', async () => {
    const upsert = mock(() => Promise.resolve({ error: null }));
    const updateUser = mock(() =>
      Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
    );

    const supabase = {
      auth: {
        getSession: mock(() => Promise.resolve({ data: { session: null }, error: null })),
        getClaims: mock(() =>
          Promise.resolve({
            data: { claims: { sub: 'user-1', email: 'user@example.com' } },
            error: null,
          }),
        ),
        updateUser,
      },
      schema: mock(() => ({
        from: mock(() => ({ upsert })),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await setActiveBrandPreference('brand-1');

    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = upsert.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload.user_id).toBe('user-1');
    expect(payload.active_brand_id).toBe('brand-1');
    expect(typeof payload.updated_at).toBe('string');
    expect(options).toEqual({ onConflict: 'user_id' });
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        onboarding: {
          activeBrandId: 'brand-1',
        },
      },
    });
  });
});
