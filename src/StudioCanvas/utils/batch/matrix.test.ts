import { describe, expect, it } from 'bun:test';
import type { BatchItem } from '@continuum/contracts';
import { crossBatches, zipBatches } from '@continuum/contracts';

import type { NodeOutput } from '../../types/execution';
import { batchMatrix, matrixCellLabel } from './matrix';

const item = (id: string): BatchItem => ({
  id,
  kind: 'image',
  url: `https://x/${id}.png`,
  label: id,
});
const out = (tag: string): NodeOutput => ({ type: 'image', mimeType: 'image/png', url: tag });

const items = (...ids: string[]): BatchItem[] => ids.map(item);

describe('batchMatrix — cross', () => {
  const left = items('p1', 'p2', 'p3');
  const right = items('m1', 'm2');
  const outputs = Array.from({ length: 6 }, (_, index) => out(`o${index}`));

  it('lays out one row per left item and one column per right item', () => {
    const layout = batchMatrix({ combine: 'cross', left, right, outputs });
    expect(layout.rows).toHaveLength(3);
    expect(layout.cols).toHaveLength(2);
  });

  it('maps every cell to the pair index crossBatches actually produced', () => {
    // The assertion that matters: a matrix disagreeing with the contracts' ordering hangs
    // the right picture under the wrong pair of thumbnails and looks entirely plausible.
    const layout = batchMatrix({ combine: 'cross', left, right, outputs });
    const pairs = crossBatches(left, right).pairs;

    for (let row = 0; row < left.length; row += 1) {
      for (let col = 0; col < right.length; col += 1) {
        const cell = layout.cellAt(row, col);
        expect(cell).toBeDefined();
        const pair = pairs[cell?.pairIndex ?? -1];
        expect(pair.left.id).toBe(left[row].id);
        expect(pair.right.id).toBe(right[col].id);
      }
    }
  });

  it('is row-major, so cell (1,0) is pair 2 for a 2-wide grid', () => {
    const layout = batchMatrix({ combine: 'cross', left, right, outputs });
    expect(layout.cellAt(0, 0)?.pairIndex).toBe(0);
    expect(layout.cellAt(0, 1)?.pairIndex).toBe(1);
    expect(layout.cellAt(1, 0)?.pairIndex).toBe(2);
    expect(layout.cellAt(2, 1)?.pairIndex).toBe(5);
  });

  it('returns undefined outside the grid rather than a wrong cell', () => {
    const layout = batchMatrix({ combine: 'cross', left, right, outputs });
    expect(layout.cellAt(3, 0)).toBeUndefined();
    expect(layout.cellAt(0, 2)).toBeUndefined();
    expect(layout.cellAt(-1, 0)).toBeUndefined();
  });

  it('flags a cell the 100 cap never ran', () => {
    const wide = Array.from({ length: 11 }, (_, index) => item(`r${index}`));
    const layout = batchMatrix({
      combine: 'cross',
      left: items('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'),
      right: wide,
      outputs: [],
    });
    expect(layout.cellAt(0, 0)?.capped).toBe(false);
    // 10 x 11 = 110 pairs; everything from index 100 on was never run.
    expect(layout.cellAt(9, 10)?.capped).toBe(true);
  });
});

describe('batchMatrix — zip', () => {
  it('renders one column, because only the diagonal exists', () => {
    const layout = batchMatrix({
      combine: 'zip',
      left: items('p1', 'p2', 'p3'),
      right: items('m1', 'm2', 'm3'),
      outputs: [out('a'), out('b'), out('c')],
    });
    expect(layout.cols).toHaveLength(0);
    expect(layout.rows).toHaveLength(3);
    expect(layout.cellAt(0, 0)?.pairIndex).toBe(0);
    expect(layout.cellAt(2, 0)?.pairIndex).toBe(2);
    expect(layout.cellAt(0, 1)).toBeUndefined();
  });

  it('stops at the shorter list, exactly where zipBatches stops', () => {
    const left = items('p1', 'p2', 'p3', 'p4', 'p5');
    const right = items('m1', 'm2', 'm3');
    const layout = batchMatrix({ combine: 'zip', left, right, outputs: [] });
    expect(layout.rows).toHaveLength(zipBatches(left, right).pairs.length);
    expect(layout.cellAt(3, 0)).toBeUndefined();
  });
});

describe('batchMatrix — single batch', () => {
  it('is one column of results, one row per item', () => {
    const layout = batchMatrix({
      combine: 'zip',
      left: items('a', 'b', 'c'),
      outputs: [out('x'), null, out('z')],
    });
    expect(layout.cols).toHaveLength(0);
    expect(layout.rows).toHaveLength(3);
    expect(layout.cellAt(1, 0)?.output).toBeNull();
    expect(layout.cellAt(2, 0)?.output).toEqual(out('z'));
  });
});

describe('matrixCellLabel', () => {
  it('names both sides of a paired cell', () => {
    const layout = batchMatrix({
      combine: 'cross',
      left: items('p1'),
      right: items('m1'),
      outputs: [],
    });
    expect(matrixCellLabel(layout, 0, 0)).toBe('p1 × m1');
  });

  it('names just the item when there is no pairing', () => {
    const layout = batchMatrix({ combine: 'zip', left: items('p1'), outputs: [] });
    expect(matrixCellLabel(layout, 0, 0)).toBe('p1');
  });
});
