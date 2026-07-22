import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));
const mockCreateSupabaseAdminClient = mock(() => ({}) as any);
const mockSetActiveBrandPreference = mock(() => Promise.resolve());

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
}));

mock.module('@/lib/brands/preferences', () => ({
  setActiveBrandPreference: mockSetActiveBrandPreference,
}));

mock.module('server-only', () => ({}));

import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

describe('getActiveBrandContext', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
    mockCreateSupabaseAdminClient.mockReset();
    mockSetActiveBrandPreference.mockReset();
  });

  it('persists fallback active brand when rpc candidate is missing', async () => {
    const permissions = [{ brand_profile_id: 'brand-1', role: 'owner' }];
    const invites: Array<{ brand_profile_id: string; role: string }> = [];
    const brands = [
      {
        id: 'brand-1',
        brand_name: 'Acme',
        logo_path: null,
        tier: 2,
        completed_at: '2026-02-26T09:00:00.000Z',
      },
    ];

    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() => Promise.resolve({ data: permissions, error: null })),
    };

    const invitesQuery: any = {
      select: mock(() => invitesQuery),
      eq: mock(() => invitesQuery),
      is: mock(() => invitesQuery),
      gt: mock(() => Promise.resolve({ data: invites, error: null })),
    };

    const brandsQuery: any = {
      select: mock(() => brandsQuery),
      in: mock(() => Promise.resolve({ data: brands, error: null })),
    };

    const schemaBuilder = {
      from: mock((table: string) => {
        if (table === 'permissions') return permissionsQuery;
        if (table === 'invites') return invitesQuery;
        if (table === 'brand_profiles') return brandsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: mock((_fn: string) => Promise.resolve({ data: null, error: null })),
    };

    const supabase = {
      auth: {
        getClaims: mock(() =>
          Promise.resolve({
            data: { claims: { sub: 'user-1', email: 'owner@example.com' } },
            error: null,
          }),
        ),
      },
      schema: mock((_schema: string) => schemaBuilder),
      storage: {
        from: mock(() => ({
          createSignedUrl: mock(() => Promise.resolve({ data: null, error: null })),
        })),
      },
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    const context = await getActiveBrandContext();

    expect(context.activeBrandId).toBe('brand-1');
    expect(context.activeBrandTier).toBe(2);
    expect(context.brandSummaries).toEqual([
      {
        id: 'brand-1',
        name: 'Acme',
        completed: true,
        logoPath: null,
        logoUrl: null,
        isPending: false,
      },
    ]);
    expect(mockSetActiveBrandPreference).toHaveBeenCalledWith('brand-1');
  });

  it('falls back to admin queries when permissions policy recursion returns 54001', async () => {
    const brands = [
      {
        id: 'brand-1',
        brand_name: 'Acme',
        logo_path: null,
        tier: 1,
        completed_at: '2026-02-26T09:00:00.000Z',
      },
    ];

    const permissionsQuery: any = {
      select: mock(() => permissionsQuery),
      eq: mock(() =>
        Promise.resolve({
          data: null,
          error: { code: '54001', message: 'statement too complex' },
        }),
      ),
    };

    const invitesQuery: any = {
      select: mock(() => invitesQuery),
      eq: mock(() => invitesQuery),
      is: mock(() => invitesQuery),
      gt: mock(() => Promise.resolve({ data: [], error: null })),
    };

    const brandsQuery: any = {
      select: mock(() => brandsQuery),
      in: mock(() => Promise.resolve({ data: brands, error: null })),
    };

    const schemaBuilder = {
      from: mock((table: string) => {
        if (table === 'permissions') return permissionsQuery;
        if (table === 'invites') return invitesQuery;
        if (table === 'brand_profiles') return brandsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: mock((_fn: string) => Promise.resolve({ data: 'brand-1', error: null })),
    };

    const supabase = {
      auth: {
        getClaims: mock(() =>
          Promise.resolve({
            data: { claims: { sub: 'user-1', email: 'owner@example.com' } },
            error: null,
          }),
        ),
      },
      schema: mock((_schema: string) => schemaBuilder),
      storage: {
        from: mock(() => ({
          createSignedUrl: mock(() => Promise.resolve({ data: null, error: null })),
        })),
      },
    };

    const adminPermissionsQuery: any = {
      select: mock(() => adminPermissionsQuery),
      eq: mock(() =>
        Promise.resolve({
          data: [{ brand_profile_id: 'brand-1', role: 'owner' }],
          error: null,
        }),
      ),
    };

    const adminInvitesQuery: any = {
      select: mock(() => adminInvitesQuery),
      eq: mock(() => adminInvitesQuery),
      is: mock(() => adminInvitesQuery),
      gt: mock(() => Promise.resolve({ data: [], error: null })),
    };

    const adminSchemaBuilder = {
      from: mock((table: string) => {
        if (table === 'permissions') return adminPermissionsQuery;
        if (table === 'invites') return adminInvitesQuery;
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    const adminSupabase = {
      schema: mock((_schema: string) => adminSchemaBuilder),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);
    mockCreateSupabaseAdminClient.mockReturnValue(adminSupabase as any);

    const context = await getActiveBrandContext();

    expect(mockCreateSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(context.activeBrandId).toBe('brand-1');
    expect(context.brandSummaries).toHaveLength(1);
    expect(context.brandSummaries[0]?.id).toBe('brand-1');
  });
});
