import { beforeEach, describe, expect, it, mock } from 'bun:test';

const writes: Array<Record<string, unknown>> = [];
let matchedRow: { id: string } | null = { id: 'brand-1' };

mock.module('next/cache', () => ({ revalidatePath: () => undefined, updateTag: () => undefined }));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          writes.push(payload);
          const query = {
            eq: () => query,
            select: () => query,
            maybeSingle: async () => ({ data: matchedRow, error: null }),
          };
          return query;
        },
      }),
    }),
  }),
}));

const { updateBrandContentLanguageAction, updateBrandTimezoneAction } = await import('./actions');

describe('brand settings actions', () => {
  beforeEach(() => {
    writes.length = 0;
    matchedRow = { id: 'brand-1' };
  });

  it('stores a chosen zone as given', async () => {
    await updateBrandTimezoneAction('brand-1', 'America/Bogota');
    expect(writes).toEqual([{ timezone: 'America/Bogota' }]);
  });

  // 'UTC' is the column default the Backend fills from the next chat's browser zone.
  it('stores a deliberate UTC as Etc/UTC so chat learning never overwrites it', async () => {
    await updateBrandTimezoneAction('brand-1', 'UTC');
    expect(writes).toEqual([{ timezone: 'Etc/UTC' }]);
  });

  it('refuses an unknown zone without writing', async () => {
    await expect(updateBrandTimezoneAction('brand-1', 'America/Cali')).rejects.toThrow(
      'Unknown time zone',
    );
    expect(writes).toEqual([]);
  });

  it('reports a content language write that RLS matched to no row instead of a false save', async () => {
    matchedRow = null;
    await expect(updateBrandContentLanguageAction('brand-1', 'Español (Colombia)')).rejects.toThrow(
      'Only a brand owner or admin',
    );
  });
});
