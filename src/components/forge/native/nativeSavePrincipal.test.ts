import { afterAll, afterEach, expect, mock, test } from 'bun:test';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const brand = '33333333-3333-4333-8333-333333333333';
const asset = '44444444-4444-4444-8444-444444444444';
const revision = '55555555-5555-4555-8555-555555555555';
const variant = '66666666-6666-4666-8666-666666666666';
const version = '77777777-7777-4777-8777-777777777777';
let user = owner, lookups = 0;
const clientBefore = { ...(await import('@/lib/supabase/client')) };
mock.module('@/lib/supabase/client', () => ({ ...clientBefore, createSupabaseBrowserClient: () => ({ auth: {
  getSession: async () => { lookups++; return { data: { session: { user: { id: user }, access_token: `token-for-${user}` } } }; },
} }) }));
const { savePinnedTemplateRevision } = await import('@/lib/library/templateSources');
const originalFetch = globalThis.fetch;
const sent: { url: string; authorization: string | null; body: unknown }[] = [];
afterEach(() => { globalThis.fetch = originalFetch; sent.length = 0; user = owner; lookups = 0; });
afterAll(() => mock.module('@/lib/supabase/client', () => clientBefore));

test('native save refuses a changed signed-in account before any HTTP request', async () => {
  user = other;
  globalThis.fetch = (async () => { throw new Error('A refused native intent must not be sent'); }) as typeof fetch;
  await expect(savePinnedTemplateRevision(asset, { brandId: brand }, owner)).rejects.toThrow(/another signed-in account/);
  expect(lookups).toBe(1);
});

test('native HTTP captures one matched owner token and sends the immutable body with that token', async () => {
  const body = { brandId: brand, idempotencyKey: revision, parentRevisionId: asset, edits: { blender: { values: { title: 'Captured' } } } };
  globalThis.fetch = (async (input, init) => {
    sent.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization'), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: revision, templateId: asset, variantId: variant, number: 2, parentRevisionId: asset,
      sourceAssetId: asset, sourceVersionId: version, checksum: 'a'.repeat(64), edits: {}, publications: [], createdBy: owner,
      createdAt: '2026-11-01T00:00:00Z', source: { assetId: asset, brandId: brand, versionId: version,
        family: 'blender', parseState: 'parsed', createdAt: '2026-11-01T00:00:00Z' } }), { status: 201 });
  }) as typeof fetch;
  const saved = await savePinnedTemplateRevision(asset, body, owner);
  expect(saved.id).toBe(revision); expect(lookups).toBe(1);
  expect(sent).toHaveLength(1); expect(sent[0]!.authorization).toBe(`Bearer token-for-${owner}`);
  expect(sent[0]!.body).toEqual(body);
});
