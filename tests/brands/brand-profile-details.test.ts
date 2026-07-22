import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockCreateSupabaseServerClient = mock(() => Promise.resolve({} as any));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import { fetchBrandProfileDetails } from '@/lib/brands/profile';

describe('fetchBrandProfileDetails', () => {
  beforeEach(() => {
    mockCreateSupabaseServerClient.mockReset();
  });

  it('maps brand profile row including logo path', async () => {
    const maybeSingle = mock(() =>
      Promise.resolve({
        data: {
          id: 'brand-1',
          brand_name: 'Acme',
          logo_path: 'logos/acme.png',
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-02T00:00:00.000Z',
          created_by: 'user-1',
          completed_at: '2026-02-03T00:00:00.000Z',
        },
        error: null,
      }),
    );

    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      maybeSingle,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    const result = await fetchBrandProfileDetails('brand-1');

    expect(result).toEqual({
      id: 'brand-1',
      name: 'Acme',
      logoPath: 'logos/acme.png',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      createdBy: 'user-1',
      completedAt: '2026-02-03T00:00:00.000Z',
    });
  });

  it('returns null when no profile exists', async () => {
    const maybeSingle = mock(() => Promise.resolve({ data: null, error: null }));
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      maybeSingle,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(fetchBrandProfileDetails('brand-2')).resolves.toBeNull();
  });

  it('throws when profile query errors', async () => {
    const maybeSingle = mock(() =>
      Promise.resolve({ data: null, error: new Error('query failed') }),
    );
    const query: any = {
      select: mock(() => query),
      eq: mock(() => query),
      maybeSingle,
    };

    const supabase = {
      schema: mock((_schema: string) => ({
        from: mock((_table: string) => query),
      })),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(supabase as any);

    await expect(fetchBrandProfileDetails('brand-3')).rejects.toThrow('query failed');
  });
});
