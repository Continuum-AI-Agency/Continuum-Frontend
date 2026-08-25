import { describe, expect, it } from 'bun:test';
import type { BatchItem } from '@continuum/contracts';

import { addBatchItems, batchItemLabel } from './addItems';

const image = (id: string): BatchItem => ({ id, kind: 'image', url: `https://x/${id}.png` });
const video = (id: string): BatchItem => ({ id, kind: 'video', url: `https://x/${id}.mp4` });
const text = (id: string, value: string): BatchItem => ({ id, kind: 'text', value });

describe('addBatchItems', () => {
  it('locks the batch to the first item it receives', () => {
    const result = addBatchItems({ items: [], itemType: null }, [image('a')]);
    expect(result.itemType).toBe('image');
    expect(result.added).toBe(1);
    expect(result.refused).toEqual([]);
  });

  it('refuses a mismatched kind by name instead of dropping it silently', () => {
    // The failure this rules out: a video dragged onto an image batch vanishing, and the
    // run then reporting success for work it never did.
    const result = addBatchItems({ items: [image('a')], itemType: 'image' }, [video('b')]);
    expect(result.added).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]).toContain('This batch holds images');
    expect(result.refused[0]).toContain('1 videos item');
    expect(result.refused[0]).toContain('start a second batch');
  });

  it('keeps the matching items when only some of an add mismatches', () => {
    const result = addBatchItems({ items: [image('a')], itemType: 'image' }, [
      image('b'),
      video('c'),
      image('d'),
    ]);
    expect(result.added).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['a', 'b', 'd']);
    expect(result.refused).toHaveLength(1);
  });

  it('counts each mismatched kind separately', () => {
    const result = addBatchItems({ items: [image('a')], itemType: 'image' }, [
      video('b'),
      video('c'),
      text('d', 'hi'),
    ]);
    expect(result.refused).toHaveLength(2);
    expect(result.refused.join(' ')).toContain('2 videos items');
    expect(result.refused.join(' ')).toContain('1 text item');
  });

  it('refuses past the 100 cap and says how many were left out', () => {
    const existing = Array.from({ length: 98 }, (_, index) => image(`e${index}`));
    const result = addBatchItems({ items: existing, itemType: 'image' }, [
      image('x'),
      image('y'),
      image('z'),
    ]);
    expect(result.items).toHaveLength(100);
    expect(result.added).toBe(2);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]).toContain('at most 100 items');
    expect(result.refused[0]).toContain('1 more was not added');
  });

  it('adds nothing and keeps the same array identity when everything is refused', () => {
    const existing = [image('a')];
    const result = addBatchItems({ items: existing, itemType: 'image' }, [video('b')]);
    expect(result.items).toBe(existing);
  });

  it('reads the lock off the existing items when itemType was never stamped', () => {
    // `batchItemType` falls back to the first item, and the UI must agree with it.
    const result = addBatchItems({ items: [text('a', 'one')] }, [image('b')]);
    expect(result.itemType).toBe('text');
    expect(result.added).toBe(0);
  });
});

describe('batchItemLabel', () => {
  it('prefers an explicit label', () => {
    expect(batchItemLabel({ id: 'a', kind: 'image', url: 'u', label: 'Hero' }, 0)).toBe('Hero');
  });

  it('uses the text itself for a text item, collapsed and clipped', () => {
    expect(batchItemLabel(text('a', '  bold   and   fast  '), 0)).toBe('bold and fast');
    const long = 'x'.repeat(60);
    expect(batchItemLabel(text('a', long), 0)).toHaveLength(40);
    expect(batchItemLabel(text('a', long), 0).endsWith('…')).toBe(true);
  });

  it('falls back to a 1-based position for unlabelled media', () => {
    expect(batchItemLabel(image('a'), 2)).toBe('Item 3');
  });
});
