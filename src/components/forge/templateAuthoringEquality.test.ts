import { describe, expect, test } from 'bun:test';
import { templateAuthoringEqual } from './templateAuthoringEquality';

describe('templateAuthoringEqual', () => {
  test('matches server and locally rehydrated command DTOs regardless of object key order', () => {
    expect(templateAuthoringEqual(
      [{ type: 'layer.duplicate', nodeId: 'draft:x', sourceNodeId: 'draft:y', name: 'Copy' }],
      [{ name: 'Copy', sourceNodeId: 'draft:y', type: 'layer.duplicate', nodeId: 'draft:x' }],
    )).toBe(true);
  });

  test('keeps command and array ordering significant', () => {
    expect(templateAuthoringEqual([1, 2], [2, 1])).toBe(false);
    expect(templateAuthoringEqual({ position: [12, 20] }, { position: [12, 21] })).toBe(false);
  });
});
