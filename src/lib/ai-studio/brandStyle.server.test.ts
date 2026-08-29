import { describe, expect, it, mock } from 'bun:test';

const activeClient: { current: unknown } = { current: null };

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => activeClient.current,
}));

const { fetchBrandStyle } = await import('./brandStyle.server');

type QueryResult = { data: unknown; error: unknown };
type RecordedQuery = { schema: string; table: string; filters: Array<[string, unknown]> };

const EMPTY: QueryResult = { data: null, error: null };

/**
 * Structural stand-in for the PostgREST builder the reader drives, recording every
 * schema/table/filter so the assertions read the query actually issued.
 */
function createFakeSupabase(config: { composite?: QueryResult; profile?: QueryResult }) {
  const queries: RecordedQuery[] = [];

  const schema = (schemaName: string) => ({
    from(table: string) {
      const recorded: RecordedQuery = { schema: schemaName, table, filters: [] };
      queries.push(recorded);

      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          recorded.filters.push([column, value]);
          return builder;
        },
        order(column: string, options: unknown) {
          recorded.filters.push([`order:${column}`, options]);
          return builder;
        },
        limit(count: number) {
          recorded.filters.push(['limit', count]);
          return builder;
        },
        async maybeSingle(): Promise<QueryResult> {
          if (table === 'brand_report_composites') return config.composite ?? EMPTY;
          if (table === 'brand_profiles') return config.profile ?? EMPTY;
          throw new Error(`Unexpected table in brand style read: ${table}`);
        },
      };

      return builder;
    },
  });

  activeClient.current = { schema };
  return { queries };
}

const BRAND = 'brand-1';

const compositeRow = (brand_tokens: unknown): QueryResult => ({
  data: { brand_tokens },
  error: null,
});

const profileRow = (brand_colors: unknown, brand_typography: unknown): QueryResult => ({
  data: { brand_colors, brand_typography },
  error: null,
});

const ONBOARDING = profileRow(['#111111'], { primary: 'Onboarding Sans', secondary: 'Old Serif' });

describe('fetchBrandStyle', () => {
  it('uses the live brand.md tokens over the frozen onboarding columns', async () => {
    // The drift this fixes: Settings writes brand_report_composites.brand_tokens, while
    // brand_profiles.{brand_colors,brand_typography} are written once at onboarding and
    // never again. Reading the columns pinned burned-in captions to the onboarding scrape.
    const { queries } = createFakeSupabase({
      composite: compositeRow({
        colors: [
          { value: '#123456', role: 'background' },
          { value: '#abcdef', role: 'primary' },
        ],
        typography: [
          { family: 'Body Grotesk', role: 'body' },
          { family: 'Display Serif', role: 'display' },
        ],
      }),
      profile: ONBOARDING,
    });

    expect(await fetchBrandStyle(BRAND)).toEqual({
      // buildCaptionStyle highlights with the first valid hex, so the primary role leads.
      colors: ['#abcdef', '#123456'],
      typography: { primary: 'Display Serif', secondary: 'Body Grotesk' },
    });

    const composite = queries.find((q) => q.table === 'brand_report_composites');
    expect(composite?.schema).toBe('brand_profiles');
    expect(composite?.filters).toEqual([
      ['brand_profile_id', BRAND],
      ['order:updated_at', { ascending: false }],
      ['limit', 1],
    ]);
  });

  it('falls back to the brand_profiles columns when the brand has no brand.md tokens', async () => {
    const { queries } = createFakeSupabase({ composite: EMPTY, profile: ONBOARDING });

    expect(await fetchBrandStyle(BRAND)).toEqual({
      colors: ['#111111'],
      typography: { primary: 'Onboarding Sans', secondary: 'Old Serif' },
    });

    expect(queries.find((q) => q.table === 'brand_profiles')?.filters).toEqual([['id', BRAND]]);
  });

  it('fills each field independently so a partial token snapshot never blanks the other', async () => {
    // brand_tokens is filled asynchronously and can hold colors with no typography yet.
    createFakeSupabase({
      composite: compositeRow({ colors: [{ value: '#abcdef' }], typography: [] }),
      profile: ONBOARDING,
    });

    expect(await fetchBrandStyle(BRAND)).toEqual({
      colors: ['#abcdef'],
      typography: { primary: 'Onboarding Sans', secondary: 'Old Serif' },
    });
  });

  it('reads an unroled font as the display face', async () => {
    createFakeSupabase({
      composite: compositeRow({ colors: [], typography: [{ family: 'Solo Sans' }] }),
      profile: EMPTY,
    });

    expect(await fetchBrandStyle(BRAND)).toEqual({
      colors: [],
      typography: { primary: 'Solo Sans', secondary: null },
    });
  });

  it('keeps the shape when both stores are empty or malformed', async () => {
    createFakeSupabase({
      composite: compositeRow({ colors: 'not-an-array', typography: [{ family: 42 }] }),
      profile: profileRow(null, 'nonsense'),
    });

    expect(await fetchBrandStyle(BRAND)).toEqual({
      colors: [],
      typography: { primary: null, secondary: null },
    });
  });
});
