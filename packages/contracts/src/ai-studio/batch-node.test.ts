import { describe, expect, it } from 'bun:test';

import {
  batchItemSchema,
  batchItemType,
  combineBatches,
  crossBatches,
  MAX_BATCH_ITEMS,
  zipBatches,
} from './batch-node';

const text = (id: string) => ({ id, kind: 'text' as const, value: id });
const image = (id: string) => ({ id, kind: 'image' as const, assetId: `asset-${id}` });
const many = (count: number) => Array.from({ length: count }, (_, index) => text(`t${index}`));

describe('batchItemSchema', () => {
  it('needs a value on a text item and a reference on a media item', () => {
    expect(batchItemSchema.safeParse({ id: '1', kind: 'text', value: 'hi' }).success).toBe(true);
    expect(batchItemSchema.safeParse({ id: '1', kind: 'text' }).success).toBe(false);

    expect(batchItemSchema.safeParse({ id: '1', kind: 'image', assetId: 'a' }).success).toBe(true);
    expect(batchItemSchema.safeParse({ id: '1', kind: 'image', url: 'u' }).success).toBe(true);
    expect(batchItemSchema.safeParse({ id: '1', kind: 'image' }).success).toBe(false);
    expect(batchItemSchema.safeParse({ id: '1', kind: 'audio', url: 'u' }).success).toBe(false);
  });
});

describe('combining two batches', () => {
  it('caps a batch at 100 items', () => {
    expect(MAX_BATCH_ITEMS).toBe(100);
  });

  it('zips position-wise and stops at the shorter list', () => {
    const { pairs, truncated } = zipBatches(
      [text('a'), text('b'), text('c')],
      [image('1'), image('2')],
    );
    expect(pairs.map((pair) => [pair.left.id, pair.right.id])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    // Pairing past the shorter list would invent an item nobody put in the batch.
    expect(truncated).toBe(false);
  });

  it('crosses every combination, row-major', () => {
    const { pairs, truncated } = crossBatches([text('a'), text('b')], [image('1'), image('2')]);
    expect(pairs.map((pair) => `${pair.left.id}${pair.right.id}`)).toEqual([
      'a1',
      'a2',
      'b1',
      'b2',
    ]);
    expect(truncated).toBe(false);
  });

  // A silent cap reads downstream as "everything ran". 11x11 is 121 real generations.
  it('says so out loud when the cap cuts a cross product short', () => {
    const { pairs, truncated } = crossBatches(many(11), many(11));
    expect(pairs).toHaveLength(MAX_BATCH_ITEMS);
    expect(truncated).toBe(true);
  });

  it('handles empty sides without inventing pairs', () => {
    expect(zipBatches([], [image('1')]).pairs).toEqual([]);
    expect(crossBatches([text('a')], []).pairs).toEqual([]);
  });

  it('routes through combineBatches by mode', () => {
    const left = [text('a'), text('b')];
    const right = [image('1'), image('2')];
    expect(combineBatches('zip', left, right).pairs).toHaveLength(2);
    expect(combineBatches('cross', left, right).pairs).toHaveLength(4);
  });
});

describe('batchItemType', () => {
  it('prefers the declared lock, then falls back to the first item', () => {
    expect(batchItemType({ itemType: 'video', items: [text('a')] })).toBe('video');
    expect(batchItemType({ items: [image('1'), image('2')] })).toBe('image');
  });

  it('is undefined for an empty or unreadable batch', () => {
    expect(batchItemType({ items: [] })).toBeUndefined();
    expect(batchItemType({})).toBeUndefined();
    expect(batchItemType(undefined)).toBeUndefined();
    expect(batchItemType({ itemType: 'audio' })).toBeUndefined();
  });
});
