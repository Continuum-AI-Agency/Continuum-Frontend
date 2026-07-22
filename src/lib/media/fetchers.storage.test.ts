import { afterEach, describe, expect, it, mock } from 'bun:test';

type TestHooks = {
  __testCreateSupabaseServerClient?: () => unknown;
};

const hooks = globalThis as TestHooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => hooks.__testCreateSupabaseServerClient?.(),
}));

import { fetchStorageUsedBytes } from './fetchers.server';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
});

describe('fetchStorageUsedBytes', () => {
  it('sums every active asset across multiple PostgREST pages and treats null size as zero', async () => {
    const rows = Array.from({ length: 1_002 }, (_, index) => ({
      id: `asset-${index}`,
      brand_id: BRAND_ID,
      deleted_at: null,
      size_bytes: index === 500 ? null : index + 1,
    }));
    rows.push({
      id: 'deleted-asset',
      brand_id: BRAND_ID,
      deleted_at: '2026-07-14T00:00:00.000Z',
      size_bytes: 999_999,
    });
    rows.push({
      id: 'other-brand',
      brand_id: '22222222-2222-4222-8222-222222222222',
      deleted_at: null,
      size_bytes: 999_999,
    });

    const activeRows = rows.filter((row) => row.brand_id === BRAND_ID && row.deleted_at === null);
    let window = { from: 0, to: 999 };
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      range: (from: number, to: number) => {
        window = { from, to };
        return Promise.resolve({ data: activeRows.slice(from, to + 1), error: null });
      },
      returns: () =>
        Promise.resolve({ data: activeRows.slice(window.from, window.to + 1), error: null }),
    };
    hooks.__testCreateSupabaseServerClient = () => ({
      schema: () => ({ from: () => query }),
    });

    const expected = rows
      .filter((row) => row.brand_id === BRAND_ID && row.deleted_at === null)
      .reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);

    await expect(fetchStorageUsedBytes(BRAND_ID)).resolves.toBe(expected);
  });
});
