import { describe, expect, it } from 'bun:test';
import type { NodeOutput } from '../../types/execution';
import { collectionPreviewSrcs } from './collectionPreview';

const collection = (items: NodeOutput[], itemType: 'text' | 'image' | 'video'): NodeOutput => ({
  type: 'collection',
  itemType,
  items,
});

const still = (base64: string): NodeOutput => ({ type: 'image', mimeType: 'image/png', base64 });

describe('collectionPreviewSrcs', () => {
  it('returns one src per still, in order — a five-frame extraction is five srcs', () => {
    const output = collection(
      [still('a'), still('b'), still('c'), still('d'), still('e')],
      'image',
    );
    expect(collectionPreviewSrcs(output as never)).toEqual([
      'data:image/png;base64,a',
      'data:image/png;base64,b',
      'data:image/png;base64,c',
      'data:image/png;base64,d',
      'data:image/png;base64,e',
    ]);
  });

  it('surfaces a collection of clips, which has no image cover to fall back on', () => {
    const output = collection(
      [
        { type: 'video', url: 'blob:part-1' },
        { type: 'video', url: 'blob:part-2' },
      ],
      'video',
    );
    expect(collectionPreviewSrcs(output as never)).toEqual(['blob:part-1', 'blob:part-2']);
  });

  it('prefers a signed URL when an image carries no bytes', () => {
    const output = collection(
      [{ type: 'image', mimeType: 'image/png', url: 'https://cdn/1.png' }],
      'image',
    );
    expect(collectionPreviewSrcs(output as never)).toEqual(['https://cdn/1.png']);
  });

  it('has nothing to show for text, which the node renders from `value` instead', () => {
    const output = collection([{ type: 'text', value: 'one' }], 'text');
    expect(collectionPreviewSrcs(output as never)).toEqual([]);
  });
});
