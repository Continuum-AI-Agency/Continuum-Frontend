import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { type BrandAccessClient, readBrandAccess } from './brandAccess.server';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

type Reply = { data: unknown; error: unknown };

const entitlements = (products: string[]) => ({
  brandId: BRAND_ID,
  planCode: products.length > 0 ? 'organic_studio' : 'free',
  status: products.length > 0 ? 'active' : 'inactive',
  billingModel: products.length > 0 ? 'stripe' : 'none',
  plans: products.length > 0 ? ['organic_studio'] : [],
  products,
  addons: [],
  trendsTier: null,
  buckets: [],
  creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
});

// A fake of exactly the two reads readBrandAccess makes, recording what it was asked.
function fakeClient(rpc: Reply | Error, tier: Reply = { data: { tier: 3 }, error: null }) {
  const calls: string[] = [];
  const client: BrandAccessClient = {
    schema: (name) => ({
      rpc: (fn, args) => {
        calls.push(`${name}.${fn}(${JSON.stringify(args)})`);
        return rpc instanceof Error ? Promise.reject(rpc) : Promise.resolve(rpc);
      },
      from: (table) => ({
        select: (columns) => ({
          eq: (column, value) => ({
            maybeSingle: () => {
              calls.push(`${name}.${table}.select(${columns}).eq(${column},${value})`);
              return Promise.resolve(tier);
            },
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}

let consoleError: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
  consoleError?.mockRestore();
  consoleError = null;
});

describe('readBrandAccess', () => {
  test('PGRST106 (billing not exposed — prod before go-live) is NOT live and keeps the tier', async () => {
    const { client, calls } = fakeClient({
      data: null,
      error: { code: 'PGRST106', message: 'The schema must be one of the following: public' },
    });
    expect(await readBrandAccess(BRAND_ID, client)).toEqual({
      billingLive: false,
      products: [],
      entitlements: null,
      legacyTier: 3,
    });
    expect(calls).toEqual([
      `billing.get_brand_entitlements({"p_brand_id":"${BRAND_ID}"})`,
      `brand_profiles.brand_profiles.select(tier).eq(id,${BRAND_ID})`,
    ]);
  });

  test('a readable billing schema is live and resolves exactly the active products', async () => {
    const read = entitlements(['organic_agent', 'studio']);
    const { client } = fakeClient({ data: read, error: null });
    expect(await readBrandAccess(BRAND_ID, client)).toEqual({
      billingLive: true,
      products: ['organic_agent', 'studio'],
      entitlements: read,
      legacyTier: 3,
    });
  });

  test('live with no product rows resolves no products, whatever the tier says', async () => {
    const { client } = fakeClient({ data: entitlements([]), error: null });
    const access = await readBrandAccess(BRAND_ID, client);
    expect(access.billingLive).toBe(true);
    expect(access.products).toEqual([]);
  });

  test('any other error fails CLOSED — live, no products — and logs the serialized error', async () => {
    consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient({
      data: null,
      error: { code: '42501', message: 'not authorized for brand', details: null, hint: null },
    });
    expect(await readBrandAccess(BRAND_ID, client)).toEqual({
      billingLive: true,
      products: [],
      entitlements: null,
      legacyTier: 3,
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('42501 · not authorized for brand');
  });

  test('a thrown transport error fails closed too', async () => {
    consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient(new Error('fetch failed'));
    expect(await readBrandAccess(BRAND_ID, client)).toMatchObject({
      billingLive: true,
      products: [],
      entitlements: null,
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('fetch failed');
  });

  test('a reply that is not the contracts shape fails closed', async () => {
    consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient({ data: { products: ['studio'] }, error: null });
    expect(await readBrandAccess(BRAND_ID, client)).toMatchObject({
      billingLive: true,
      products: [],
      entitlements: null,
    });
  });

  test('a missing or unreadable tier row is tier 0', async () => {
    const { client } = fakeClient(
      { data: null, error: { code: 'PGRST106' } },
      { data: null, error: { code: 'PGRST116' } },
    );
    expect((await readBrandAccess(BRAND_ID, client)).legacyTier).toBe(0);
  });
});
