import { expect, test } from 'bun:test';
import type { TemplateAuthoringScope } from '@continuum/contracts';
import { layerDraftStorageKey, uniqueWorkingCopyRecovery } from './useTemplateAuthoringDraft';
import { templateAuthoringViewStateKey, templateDraftScopeKey, type TemplateDraftRecovery } from './templateDraftRecovery';
import { authoringScopeQuery, sameAuthoringScope, withAuthoringWorkingCopy } from './authoringScope';

const source: TemplateAuthoringScope = { brandId: '10000000-0000-4000-8000-000000000001', assetId: '10000000-0000-4000-8000-000000000002', baseVersionId: '10000000-0000-4000-8000-000000000003' };
const a = { ...source, workingCopyId: '20000000-0000-4000-8000-000000000001' };
const b = { ...source, workingCopyId: '20000000-0000-4000-8000-000000000002' };

test('identical bytes retain separate draft, recovery and view keys for each working copy and legacy', () => {
  for (const key of [templateDraftScopeKey, (user: string, scope: TemplateAuthoringScope) => layerDraftStorageKey(user, scope, 'same-package'),
    (user: string, scope: TemplateAuthoringScope) => templateAuthoringViewStateKey(user, scope, 'same-package')]) {
    expect(new Set([key('actor', source), key('actor', a), key('actor', b)]).size).toBe(3);
  }
  expect(sameAuthoringScope(a, b)).toBe(false);
  expect(sameAuthoringScope(a, source)).toBe(false);
  expect(authoringScopeQuery(a)).toEqual({ brandId: a.brandId, baseVersionId: a.baseVersionId, workingCopyId: a.workingCopyId });
  expect(() => withAuthoringWorkingCopy(a, { workingCopyId: b.workingCopyId })).toThrow('another private working copy');
});

test('restart adopts only an unambiguous local snapshot from the exact working copy', () => {
  const recovery: TemplateDraftRecovery = { id: 'a', userId: 'actor', scope: a, workspaceIdentity: 'same-package', sourceChecksum: 'a'.repeat(64),
    revision: 2, commands: [{ type: 'layer.delete', nodeId: 'aep:1:2' }], persistedCommands: [], reason: 'local', savedAt: new Date().toISOString() };
  const other = { ...recovery, id: 'b', scope: b, commands: [] };
  expect(uniqueWorkingCopyRecovery([recovery, other], a)).toEqual(recovery);
  expect(uniqueWorkingCopyRecovery([{ ...recovery, scope: source }], a)).toBeNull();
  expect(uniqueWorkingCopyRecovery([recovery, { ...recovery, id: 'divergent-tab', commands: [] }], a)).toBeNull();
});
