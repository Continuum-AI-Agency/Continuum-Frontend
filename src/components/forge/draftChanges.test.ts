import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringCommand } from '@continuum/contracts';
import { describeDraftChanges, describeTurnChanges, withoutLayerChanges } from './draftChanges';

const nodes = [
  { nodeId: 'aep:7:1', name: 'Headline' },
  { nodeId: 'aep:7:2', name: 'Badge' },
  { nodeId: 'draft:new-title', name: 'Title' },
];
const edit = (nodeId: string, fields: Record<string, unknown>) =>
  ({ type: 'layer.edit', nodeId, edit: { compId: 7, layerId: Number(nodeId.split(':')[2]), ...fields } }) as TemplateAuthoringCommand;

describe('describeDraftChanges', () => {
  test('one row per layer, in plain words, the last opacity winning', () => {
    const rows = describeDraftChanges(
      [edit('aep:7:1', { text: 'Sale' }), edit('aep:7:2', { y: 240 }), edit('aep:7:2', { opacity: 60 }), edit('aep:7:2', { opacity: 40 })],
      nodes,
    );
    expect(rows).toEqual([
      { key: 'aep:7:1', name: 'Headline', changes: ['text'], undoable: true },
      { key: 'aep:7:2', name: 'Badge', changes: ['moved', 'opacity 40%'], undoable: true },
    ]);
  });

  test('added layers and layer order are listed but never undone piecemeal', () => {
    const rows = describeDraftChanges(
      [
        { type: 'text.create', nodeId: 'draft:new-title', compId: 7, name: 'Title', text: 'Hi' } as unknown as TemplateAuthoringCommand,
        { type: 'composition.order', compId: 7, nodeIds: ['draft:new-title', 'aep:7:1'] } as unknown as TemplateAuthoringCommand,
        edit('aep:7:1', { visible: false }),
      ],
      nodes,
    );
    expect(rows.map((row) => [row.name, row.changes, row.undoable])).toEqual([
      ['Title', ['added'], false],
      ['Layer order', ['reordered'], false],
      // Hidden, but the layer order names it, so dropping its edits alone is not offered.
      ['Headline', ['hidden'], false],
    ]);
  });

  test('withoutLayerChanges keeps every other command', () => {
    const commands = [edit('aep:7:1', { text: 'Sale' }), edit('aep:7:2', { y: 240 })];
    expect(withoutLayerChanges(commands, 'aep:7:2')).toEqual([commands[0]]);
  });
});

describe('describeTurnChanges', () => {
  test('names only what the turn changed, even when the editor merged the edits', () => {
    const before = [edit('aep:7:1', { text: 'Sale' }), edit('aep:7:2', { x: 10 })];
    // The editor's snapshot merges every edit on a layer into one command.
    const after = [edit('aep:7:1', { text: 'Sale' }), edit('aep:7:2', { x: 10, rotation: 15, opacity: 60 })];
    expect(describeTurnChanges(before, after, ['aep:7:2'], nodes)).toEqual([
      { key: 'aep:7:2', name: 'Badge', changes: ['rotated', 'opacity 60%'], undoable: true },
    ]);
  });
});
