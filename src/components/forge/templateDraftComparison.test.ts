import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringCommand } from '@continuum/contracts';
import { compareTemplateDrafts } from './templateDraftComparison';

describe('compareTemplateDrafts', () => {
  test('names authored text, exact font, deleted layers, and complete node order', () => {
    const created = 'draft:10000000-0000-4000-8000-000000000001';
    const local: TemplateAuthoringCommand[] = [
      {
        type: 'text.create', nodeId: created, compId: 11, name: 'Score', text: '2–0',
        fontRef: { fontId: '10000000-0000-4000-8000-000000000002', postScriptName: 'Studio-Bold', sha256: 'a'.repeat(64) },
        fontSize: 42, fillColor: [1, 1, 1], position: [12, 30],
      },
      { type: 'layer.delete', nodeId: 'aep:11:9' },
      { type: 'composition.order', compId: 11, nodeIds: [created] },
    ];
    const changes = compareTemplateDrafts(local, [], new Map([[created, 'Score']]));
    expect(changes).toEqual(expect.arrayContaining([
      { label: 'Score · Text', local: '2–0', server: 'No change' },
      { label: 'Score · Font', local: 'Studio-Bold', server: 'No change' },
      { label: 'Layer · Layer', local: 'Removed', server: 'No change' },
      { label: 'Composition 11 · Layer order', local: 'Score', server: 'No change' },
    ]));
  });
});
