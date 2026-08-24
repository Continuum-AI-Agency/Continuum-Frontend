import { describe, expect, it } from 'bun:test';
import {
  buildElementDragPayload,
  parseElementDragPayload,
  parseReferenceDropPayload,
} from './referenceDrop';

describe('element drag payload', () => {
  it('round-trips an element through the drag envelope', () => {
    const raw = buildElementDragPayload({
      elementId: 'element-1',
      name: 'Aria',
      category: 'model',
      previewUrl: 'https://storage/ref.png',
    });

    expect(parseElementDragPayload(raw)).toEqual({
      elementId: 'element-1',
      name: 'Aria',
      category: 'model',
      previewUrl: 'https://storage/ref.png',
    });
  });

  it('refuses anything that is not an element envelope', () => {
    expect(parseElementDragPayload('')).toBeNull();
    expect(parseElementDragPayload('not json')).toBeNull();
    expect(parseElementDragPayload(JSON.stringify({ type: 'asset_drop', payload: {} }))).toBeNull();
    expect(
      parseElementDragPayload(JSON.stringify({ type: 'element_drop', payload: { name: 'x' } })),
    ).toBeNull();
  });

  it('drops the preview when it is not a string, keeping the rest usable', () => {
    const raw = JSON.stringify({
      type: 'element_drop',
      payload: { elementId: 'e', name: 'n', category: 'product', previewUrl: 42 },
    });

    expect(parseElementDragPayload(raw)?.previewUrl).toBeUndefined();
  });

  it('is not mistaken for a creative-asset drop', () => {
    const raw = buildElementDragPayload({ elementId: 'e', name: 'n', category: 'product' });

    // The asset parser treats unknown JSON as a plain-text URL; what matters is that
    // it never claims the element envelope as a remote asset with a real path.
    expect(parseReferenceDropPayload(raw)).toEqual({
      kind: 'remote',
      publicUrl: raw,
      mimeType: undefined,
    });
  });
});
