import { describe, expect, test } from 'bun:test';
import {
  createLayerHistory,
  endLayerHistoryGroup,
  isLayerHistoryDirty,
  markLayerHistorySaved,
  redoLayerHistory,
  undoLayerHistory,
  updateLayerHistory,
} from './layerHistory';

const empty = { edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [] };

describe('layer history', () => {
  test('undoes and redoes edits, order, and exposure together; a new edit drops redo', () => {
    let history = createLayerHistory(empty);
    history = updateLayerHistory(history, {
      edits: { 1: { layerId: 1, compId: 2, rotation: 45 } },
      orders: { 2: [1, 3] },
      exposures: { headline: false },
    });
    expect(history.present.orders[2]).toEqual([1, 3]);
    history = undoLayerHistory(history);
    expect(history.present).toEqual(empty);
    history = redoLayerHistory(history);
    expect(history.present.edits[1]?.rotation).toBe(45);
    history = undoLayerHistory(history);
    history = updateLayerHistory(history, { ...empty, exposures: { image: false } });
    expect(history.future).toHaveLength(0);
    expect(redoLayerHistory(history)).toBe(history);
  });

  test('coalesces an interaction into one step and ends the group at commit', () => {
    let history = createLayerHistory(empty);
    history = updateLayerHistory(
      history,
      { ...empty, edits: { 1: { layerId: 1, compId: 2, position: [1, 0] } } },
      'drag',
    );
    history = updateLayerHistory(
      history,
      { ...empty, edits: { 1: { layerId: 1, compId: 2, position: [2, 0] } } },
      'drag',
    );
    history = endLayerHistoryGroup(history);
    history = updateLayerHistory(
      history,
      { ...empty, edits: { 1: { layerId: 1, compId: 2, position: [3, 0] } } },
      'drag',
    );
    expect(history.past).toHaveLength(2);
    expect(undoLayerHistory(history).present.edits[1]?.position).toEqual([2, 0]);
  });

  test('saving marks its snapshot as baseline and keeps later edits dirty and undoable', () => {
    const saved = { ...empty, exposures: { headline: false } };
    let history = createLayerHistory(empty);
    history = updateLayerHistory(history, saved);
    const afterRequestEdit = updateLayerHistory(history, {
      ...saved,
      edits: { 1: { layerId: 1, compId: 2, rotation: 45 } },
    });
    const next = markLayerHistorySaved(afterRequestEdit, saved);
    expect(isLayerHistoryDirty(next)).toBe(true);
    expect(undoLayerHistory(next).present).toEqual(saved);
    expect(isLayerHistoryDirty(undoLayerHistory(next))).toBe(false);
  });

  test('create, duplicate, delete and authored-node edits share undo, redo and dirty tracking', () => {
    const nodeId = 'draft:11111111-1111-4111-8111-111111111111';
    const created = {
      ...empty,
      operations: [
        {
          type: 'text.create' as const,
          nodeId,
          compId: 7,
          name: 'Headline',
          text: 'Studio',
          fontRef: {
            fontId: '33333333-3333-4333-8333-333333333333',
            postScriptName: 'Studio-Bold',
            sha256: 'a'.repeat(64),
          },
          fontSize: 48,
          fillColor: [0, 0, 0] as [number, number, number],
          position: [4.125, 8.5] as [number, number],
        },
      ],
    };
    let history = updateLayerHistory(createLayerHistory(empty), created);
    expect(isLayerHistoryDirty(history)).toBe(true);
    history = updateLayerHistory(history, {
      ...created,
      operations: [
        ...created.operations,
        { type: 'layer.edit', nodeId, edit: { position: [5, 9] } },
      ],
    });
    history = updateLayerHistory(history, {
      ...history.present,
      operations: [...history.present.operations, { type: 'layer.delete', nodeId }],
    });
    const beforeDelete = undoLayerHistory(history);
    expect(beforeDelete.present.operations.at(-1)).toEqual({
      type: 'layer.edit', nodeId, edit: { position: [5, 9] },
    });
    expect(redoLayerHistory(history).present.operations.at(-1)).toEqual({
      type: 'layer.delete', nodeId,
    });
    expect(undoLayerHistory(undoLayerHistory(beforeDelete)).present).toEqual(empty);
    expect(undoLayerHistory(undoLayerHistory(beforeDelete)).future).toHaveLength(3);
  });

  test('authored mask update and delete remain distinct private undo steps', () => {
    const nodeId = 'aep:11:9';
    const draftMaskId = '20000000-0000-4000-8000-000000000020';
    const created = {
      ...empty,
      operations: [{ type: 'mask.create' as const, nodeId, draftMaskId, name: 'Inset', shape: 'rectangle' as const,
        center: [-8, 4] as [number, number], size: [18, 10] as [number, number], mode: 'subtract' as const,
        opacity: 80, feather: [1, 2] as [number, number] }],
    };
    let history = updateLayerHistory(createLayerHistory(empty), created);
    history = updateLayerHistory(history, {
      ...created,
      operations: [...created.operations, { type: 'mask.update' as const, nodeId, draftMaskId, patch: { center: [-4, 4] as [number, number] } }],
    });
    history = updateLayerHistory(history, {
      ...history.present,
      operations: [...history.present.operations, { type: 'mask.delete' as const, nodeId, draftMaskId }],
    });

    expect(undoLayerHistory(history).present.operations.at(-1)).toMatchObject({
      type: 'mask.update', nodeId, draftMaskId, patch: { center: [-4, 4] },
    });
    expect(redoLayerHistory(history).present.operations.at(-1)).toEqual({ type: 'mask.delete', nodeId, draftMaskId });
    expect(isLayerHistoryDirty(history)).toBe(true);
  });
});
