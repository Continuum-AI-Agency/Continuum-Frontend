import { afterEach, expect, mock, test } from 'bun:test';
import type { TemplateOperationInput, TemplateAuthoringWorkingCopy } from '@continuum/contracts';

const userId = '10000000-0000-4000-8000-000000000001';
let session = { access_token: 'test-only-token', user: { id: userId } };
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) }));
const { appendTemplateAuthoringHistory, openTemplateAuthoringWorkingCopy, fetchTemplateAuthoringDraft,
  prepareTemplateAuthoringArtifact, fetchTemplateLayerInventory } = await import('./templateSources');
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
