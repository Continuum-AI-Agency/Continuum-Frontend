import { afterEach, expect, mock, test } from 'bun:test';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userId = id(1), brandId = id(2), assetId = id(3);
let session = { access_token: 'fixture-token', user: { id: userId } };
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  getSession: async () => ({ data: { session } }),
} }) }));
const { diffTemplateVersions, rollbackTemplateRelease } = await import('./templateSources');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; session = { access_token: 'fixture-token', user: { id: userId } }; });

test('the authenticated comparison client retains actual service from/to values', async () => {
  const answer = { fromRevisionId: id(4), toRevisionId: id(5), sourceChanged: false,
    changes: [{ path: '/slots/headline/defaultValue', from: 'Before', to: 'After' }] };
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain(`/templates/${assetId}/diff`);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-token' });
    expect(JSON.parse(String(init?.body))).toEqual({ brandId, fromRevisionId: id(4), toRevisionId: id(5) });
    return Response.json(answer);
  }) as typeof fetch;
  expect(await diffTemplateVersions(assetId, { brandId, fromRevisionId: id(4), toRevisionId: id(5) })).toEqual(answer);
});
test('a queued release cannot be replayed by a different authenticated account', async () => {
  session = { access_token: 'other-fixture-token', user: { id: id(9) } };
  const request = mock(async () => Response.json({})); globalThis.fetch = request as typeof fetch;
  await expect(rollbackTemplateRelease(assetId, { brandId, bindingId: id(6), templateKey: 'campaign',
    expectedReleaseId: id(7), releaseId: id(8), idempotencyKey: 'retained-request' }, userId))
    .rejects.toThrow('another signed-in account');
  expect(request).not.toHaveBeenCalled();
});
