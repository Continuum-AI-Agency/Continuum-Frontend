import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringCommand, TemplateAuthoringDraft, TemplateAuthoringScope } from '@continuum/contracts';
import { LayerDraftAutosaver } from './layerDraft';
import { reconcileTemplateAuthoringTabSave } from './useTemplateAuthoringDraft';

const scope: TemplateAuthoringScope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};
const edit = (rotation: number): TemplateAuthoringCommand => ({
  type: 'layer.edit', nodeId: 'aep:7:31', edit: { compId: 7, layerId: 31, rotation },
});
const serverDraft = (revision: number, commands: TemplateAuthoringCommand[]) => ({
  scope, sourceChecksum: 'a'.repeat(64), revision, commands, updatedAt: new Date().toISOString(),
}) as TemplateAuthoringDraft;

describe('same-workspace tab saves', () => {
  test('reloads a clean editor when another tab announces a newer revision', () => {
    const autosaver = new LayerDraftAutosaver({
      scope, revision: 2, persistedCommands: [],
      write: async (_scope, revision, commands) => serverDraft(revision + 1, commands),
    });
    let refreshes = 0;

    reconcileTemplateAuthoringTabSave(autosaver, 2, () => { refreshes += 1; });
    reconcileTemplateAuthoringTabSave(autosaver, 3, () => { refreshes += 1; });

    expect(refreshes).toBe(1);
    expect(autosaver.view.status).toBe('saved');
    autosaver.dispose();
  });

  test('locks a dirty editor for explicit reconciliation and keeps its commands', () => {
    const autosaver = new LayerDraftAutosaver({
      scope, revision: 2, persistedCommands: [],
      write: async (_scope, revision, commands) => serverDraft(revision + 1, commands),
    });
    const local = [edit(15)];
    autosaver.update(local);
    let refreshes = 0;

    reconcileTemplateAuthoringTabSave(autosaver, 3, () => { refreshes += 1; });

    expect(refreshes).toBe(0);
    expect(autosaver.view.status).toBe('conflict');
    expect(autosaver.view.dirty).toBe(true);
    expect(autosaver.view.error).toContain('Another tab saved a newer draft');
    autosaver.dispose();
  });
});
