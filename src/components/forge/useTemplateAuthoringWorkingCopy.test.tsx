import { afterEach, expect, mock, test } from 'bun:test';
import type { TemplateAuthoringWorkingCopy, TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const userId = '10000000-0000-4000-8000-000000000001';
const brandId = '10000000-0000-4000-8000-000000000002';
const assetId = '10000000-0000-4000-8000-000000000003';
const versionId = '10000000-0000-4000-8000-000000000004';
const revisionA = '20000000-0000-4000-8000-000000000001';
const revisionB = '20000000-0000-4000-8000-000000000002';
const variantA = '30000000-0000-4000-8000-000000000001';
const variantB = '30000000-0000-4000-8000-000000000002';
const copyFor = (variantId: string, baseRevisionId: string): TemplateAuthoringWorkingCopy => ({
  id: variantId === variantA ? '40000000-0000-4000-8000-000000000001' : '40000000-0000-4000-8000-000000000002',
  principalId: userId, brandId, templateId: assetId, variantId, baseRevisionId,
  sourceAssetId: assetId, sourceVersionId: versionId, sourceChecksum: 'a'.repeat(64),
  createdAt: new Date().toISOString(), closedAt: null, landedRevisionId: null,
});
const selection = (variantId: string, revisionId: string, original = false, head = revisionId) => ({
  variant: { variantId, templateId: assetId, original, draftHeadRevisionId: head, archivedAt: null } as TemplateRevisionVariant,
  revision: { id: revisionId, sourceAssetId: assetId, sourceVersionId: versionId } as TemplateRevision,
});
const open = mock(async (_family: string, request: { variantId: string; baseRevisionId: string }) => copyFor(request.variantId, request.baseRevisionId));
mock.module('@/lib/library/templateSources', () => ({ fetchTemplateAuthoringUserId: async () => userId, openTemplateAuthoringWorkingCopy: open }));
const { useTemplateAuthoringWorkingCopy } = await import('./useTemplateAuthoringWorkingCopy');
afterEach(() => { cleanup(); open.mockReset(); open.mockImplementation(async (_family, request) => copyFor(request.variantId, request.baseRevisionId)); });

test('variant identity separates private copies even when every source byte pin is identical', async () => {
  const { result, rerender } = renderHook(({ selected, requestKey }) => useTemplateAuthoringWorkingCopy({ brandId, selection: selected, requestKey, enabled: true }),
    { initialProps: { selected: selection(variantA, revisionA), requestKey: 'branch-a' } });
  await waitFor(() => expect(result.current.copy?.variantId).toBe(variantA));
  const copyA = result.current.copy!;
  rerender({ selected: selection(variantB, revisionB), requestKey: 'branch-b' });
  await waitFor(() => expect(result.current.copy?.variantId).toBe(variantB));
  expect(result.current.copy!.sourceVersionId).toBe(copyA.sourceVersionId);
  expect(result.current.copy!.id).not.toBe(copyA.id);
});

test('server-resumed older base remains authoritative when the branch head advances', async () => {
  open.mockImplementation(async () => copyFor(variantA, revisionA));
  const { result, rerender } = renderHook(({ selected }) => useTemplateAuthoringWorkingCopy({ brandId, selection: selected, requestKey: 'branch-a', enabled: true }),
    { initialProps: { selected: selection(variantA, revisionB) } });
  await waitFor(() => expect(result.current.copy?.baseRevisionId).toBe(revisionA));
  rerender({ selected: selection(variantA, revisionB, false, '20000000-0000-4000-8000-000000000099') });
  expect(result.current.copy?.baseRevisionId).toBe(revisionA);
  expect(result.current.readOnly).toBe(false);
  expect(open).toHaveBeenCalledTimes(1);
});

test('Original and historical inspection never create writable working copies', async () => {
  const { result, rerender } = renderHook(({ selected }) => useTemplateAuthoringWorkingCopy({ brandId, selection: selected, requestKey: selected.revision.id, enabled: true }),
    { initialProps: { selected: selection(variantA, revisionA, true) } });
  expect(result.current.readOnly).toBe(true);
  rerender({ selected: selection(variantA, revisionB, false, revisionA) });
  expect(result.current.readOnly).toBe(true);
  expect(open).not.toHaveBeenCalled();
});

test('a delayed branch-open reply cannot replace the currently selected working copy', async () => {
  let finish!: (copy: TemplateAuthoringWorkingCopy) => void;
  const pending = new Promise<TemplateAuthoringWorkingCopy>((resolve) => { finish = resolve; });
  open.mockImplementation(async (_family, request) => request.variantId === variantA ? pending : copyFor(variantB, revisionB));
  const { result, rerender } = renderHook(({ selected, requestKey }) => useTemplateAuthoringWorkingCopy({ brandId, selection: selected, requestKey, enabled: true }),
    { initialProps: { selected: selection(variantA, revisionA), requestKey: 'a' } });
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  rerender({ selected: selection(variantB, revisionB), requestKey: 'b' });
  await waitFor(() => expect(result.current.copy?.variantId).toBe(variantB));
  await act(async () => finish(copyFor(variantA, revisionA)));
  expect(result.current.copy?.variantId).toBe(variantB);
});
