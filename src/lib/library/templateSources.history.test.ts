import { afterEach, expect, mock, test } from 'bun:test';
import { templateLayerViewQuerySchema, type TemplateOperationInput, type TemplateAuthoringWorkingCopy } from '@continuum/contracts';

const userId = '10000000-0000-4000-8000-000000000001';
let session = { access_token: 'test-only-token', user: { id: userId } };
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) }));
const { appendTemplateAuthoringHistory, openTemplateAuthoringWorkingCopy, fetchTemplateAuthoringDraft,
  prepareTemplateAuthoringArtifact, fetchTemplateLayerInventory, fetchTemplateVersionHistory } = await import('./templateSources');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; session = { access_token: 'test-only-token', user: { id: userId } }; });
const operation: TemplateOperationInput = {
  id: '20000000-0000-4000-8000-000000000001', workingCopyId: '20000000-0000-4000-8000-000000000002', sequence: 1,
  command: 'forge_authoring_command', baseRevisionId: null, channel: 'forge', outcome: 'succeeded',
  affectedObjects: [], changes: { command: { type: 'layer.delete', nodeId: 'aep:1:2' } }, evidence: 'recorded', causedBy: [],
};
const brandId = '30000000-0000-4000-8000-000000000001';
const assetId = '30000000-0000-4000-8000-000000000002';
const workingCopy: TemplateAuthoringWorkingCopy = {
  id: '40000000-0000-4000-8000-000000000001', brandId, principalId: userId, templateId: assetId,
  variantId: '40000000-0000-4000-8000-000000000002', baseRevisionId: '40000000-0000-4000-8000-000000000003',
  sourceAssetId: assetId, sourceVersionId: '40000000-0000-4000-8000-000000000004', sourceChecksum: 'a'.repeat(64),
  createdAt: new Date().toISOString(), closedAt: null, landedRevisionId: null,
};
function acknowledged(value = operation) {
  return { ...value, principalId: userId, revisionId: null, revisionIds: [], receivedAt: new Date().toISOString() };
}

test('history uses the shared authenticated service and checks exact acknowledged event intent', async () => {
  let received: unknown;
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain(`/api/ai-studio/templates/${assetId}/history`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only-token' });
    received = JSON.parse(String(init?.body));
    return Response.json({ items: [acknowledged()] });
  }) as typeof fetch;
  await appendTemplateAuthoringHistory(userId, assetId, brandId, [operation]);
  expect(received).toEqual({ brandId, operations: [operation] });
});

test('account changes, partial acknowledgement and changed intent fail without accepting a false acknowledgement', async () => {
  const request = mock(async () => Response.json({ items: [] }));
  globalThis.fetch = request as typeof fetch;
  session = { access_token: 'other-account-token', user: { id: '40000000-0000-4000-8000-000000000001' } };
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('another signed-in account');
  expect(request).not.toHaveBeenCalled();
  session = { access_token: 'test-only-token', user: { id: userId } };
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('did not acknowledge every operation');
  globalThis.fetch = mock(async () => Response.json({ items: [acknowledged({ ...operation, changes: { command: 'different' } })] })) as typeof fetch;
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('did not acknowledge every operation');
});

test('normal branch open accepts only owned exact copy metadata and preserves the server-resumed older base', async () => {
  globalThis.fetch = mock(async () => Response.json(workingCopy)) as typeof fetch;
  const copy = await openTemplateAuthoringWorkingCopy(assetId, { brandId, variantId: workingCopy.variantId,
    baseRevisionId: '40000000-0000-4000-8000-000000000099' }, userId);
  expect(copy.baseRevisionId).toBe(workingCopy.baseRevisionId);
  await expect(openTemplateAuthoringWorkingCopy(assetId, { brandId, variantId: workingCopy.variantId,
    baseRevisionId: '40000000-0000-4000-8000-000000000099', workingCopyId: workingCopy.id }, userId)).rejects.toThrow('different private working copy');
  globalThis.fetch = mock(async () => Response.json({ ...workingCopy, principalId: '40000000-0000-4000-8000-000000000099' })) as typeof fetch;
  await expect(openTemplateAuthoringWorkingCopy(assetId, { brandId, variantId: workingCopy.variantId,
    baseRevisionId: workingCopy.baseRevisionId }, userId)).rejects.toThrow('different private working copy');
});

test('draft queries, materialization requests and source reads carry the selected working copy', async () => {
  const observed: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    observed.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return String(url).includes('/authoring-draft?') ? Response.json({ draft: null }) : Response.json({ detail: 'Explicit component refusal' }, { status: 422 });
  }) as typeof fetch;
  await fetchTemplateAuthoringDraft(assetId, brandId, workingCopy.sourceVersionId, workingCopy.id);
  await expect(fetchTemplateLayerInventory(brandId, assetId, workingCopy.sourceVersionId, workingCopy.id)).rejects.toThrow('Explicit component refusal');
  const request = { artifactId: workingCopy.id, expectedDraftRevision: 1, sourceChecksum: 'a'.repeat(64), commandDigest: 'b'.repeat(64), packageChecksum: 'c'.repeat(64) };
  await expect(prepareTemplateAuthoringArtifact(assetId, workingCopy.id,
    { brandId, baseVersionId: workingCopy.sourceVersionId, workingCopyId: workingCopy.id }, request)).rejects.toThrow('Explicit component refusal');
  expect(observed.every((entry) => new URL(entry.url).searchParams.get('workingCopyId') === workingCopy.id)).toBe(true);
  expect(observed[2]!.body).toMatchObject({ workingCopyId: workingCopy.id });
  const calls = observed.length;
  await expect(prepareTemplateAuthoringArtifact(assetId, workingCopy.id,
    { brandId, baseVersionId: workingCopy.sourceVersionId, workingCopyId: workingCopy.id },
    { ...request, workingCopyId: '40000000-0000-4000-8000-000000000099' })).rejects.toThrow('another private working copy');
  expect(observed).toHaveLength(calls);
});


test('layer source queries retain exact revision and working-copy pins together and reject malformed pins', () => {
  const query = { brandId, versionId: workingCopy.sourceVersionId, revisionId: workingCopy.baseRevisionId,
    workingCopyId: workingCopy.id, compId: '63' };
  expect(templateLayerViewQuerySchema.parse(query)).toEqual({ ...query, compId: 63 });
  expect(templateLayerViewQuerySchema.parse({ brandId, versionId: workingCopy.sourceVersionId })).toEqual({ brandId, versionId: workingCopy.sourceVersionId });
  for (const pin of ['revisionId', 'workingCopyId'])
    expect(templateLayerViewQuerySchema.safeParse({ ...query, [pin]: 'not-a-uuid' }).success).toBe(false);
});


test('history paging carries opaque cursors and legacy stream queries through the canonical contract', async () => {
  const queries: URLSearchParams[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    queries.push(new URL(String(url)).searchParams);
    return Response.json({ items: [], nextCursor: queries.length === 1 ? 'next-page' : null });
  }) as typeof fetch;
  expect((await fetchTemplateVersionHistory(brandId, assetId, {}, userId)).nextCursor).toBe('next-page');
  await fetchTemplateVersionHistory(brandId, assetId, { cursor: 'next-page', limit: 200 }, userId);
  expect(Object.fromEntries(queries[1]!)).toEqual({ brandId, limit: '200', cursor: 'next-page' });
  await fetchTemplateVersionHistory(brandId, assetId, { workingCopyId: operation.workingCopyId, afterSequence: 25 }, userId);
  expect(queries[2]!.get('afterSequence')).toBe('25');
  const calls = queries.length;
  await expect(fetchTemplateVersionHistory(brandId, assetId, { cursor: 'not a cursor' }, userId)).rejects.toThrow();
  await expect(fetchTemplateVersionHistory(brandId, assetId, { cursor: 'next-page', workingCopyId: operation.workingCopyId }, userId)).rejects.toThrow();
  expect(queries).toHaveLength(calls);
});

test('history reads reject changed authentication before dispatch and after a late response', async () => {
  const request = mock(async () => Response.json({ items: [], nextCursor: null }));
  globalThis.fetch = request as typeof fetch;
  const originalUser = userId;
  session = { access_token: 'test-only-token', user: { id: '40000000-0000-4000-8000-000000000099' } };
  await expect(fetchTemplateVersionHistory(brandId, assetId, {}, originalUser)).rejects.toThrow('another signed-in account');
  expect(request).not.toHaveBeenCalled();
  session = { access_token: 'test-only-token', user: { id: originalUser } };
  globalThis.fetch = mock(async () => {
    session = { access_token: 'test-only-token', user: { id: '40000000-0000-4000-8000-000000000099' } };
    return Response.json({ items: [], nextCursor: null });
  }) as typeof fetch;
  await expect(fetchTemplateVersionHistory(brandId, assetId, {}, originalUser)).rejects.toThrow('another signed-in account');
});
