import { describe, expect, it } from 'bun:test';

import { resolveConceptPreviewUrls } from './conceptPreview';

describe('resolveConceptPreviewUrls', () => {
  it('returns nothing for an empty or missing preview', () => {
    expect(resolveConceptPreviewUrls(undefined)).toEqual([]);
    expect(resolveConceptPreviewUrls(null)).toEqual([]);
    expect(resolveConceptPreviewUrls({})).toEqual([]);
    expect(resolveConceptPreviewUrls({ imageUrl: '   ' })).toEqual([]);
  });

  it('passes through http(s), data, and blob URLs unchanged', () => {
    expect(resolveConceptPreviewUrls({ imageUrl: 'https://cdn/x.png' })).toEqual([
      'https://cdn/x.png',
    ]);
    expect(resolveConceptPreviewUrls({ imageUrl: 'http://cdn/x.png' })).toEqual([
      'http://cdn/x.png',
    ]);
    expect(resolveConceptPreviewUrls({ imageUrl: 'data:image/png;base64,abc' })).toEqual([
      'data:image/png;base64,abc',
    ]);
    expect(resolveConceptPreviewUrls({ imageUrl: 'blob:nanobanana' })).toEqual(['blob:nanobanana']);
  });

  it('normalizes a bare base64 string into a PNG data URL', () => {
    expect(resolveConceptPreviewUrls({ imageUrl: 'iVBORw0KGgoAAAANS' })).toEqual([
      'data:image/png;base64,iVBORw0KGgoAAAANS',
    ]);
  });

  // The regression: a carousel arrives as N storyboard frames and the card showed one of
  // them, so a carousel and a single post were indistinguishable in the transcript.
  it('keeps every frame, not just the cover', () => {
    expect(
      resolveConceptPreviewUrls({ images: ['https://cdn/1.png', 'https://cdn/2.png'] }),
    ).toEqual(['https://cdn/1.png', 'https://cdn/2.png']);
  });

  it('leads with imageUrl and does not repeat it when images carries it too', () => {
    expect(
      resolveConceptPreviewUrls({
        imageUrl: 'https://cdn/cover.png',
        images: ['https://cdn/cover.png', 'https://cdn/2.png'],
      }),
    ).toEqual(['https://cdn/cover.png', 'https://cdn/2.png']);
  });

  it('drops unusable entries without dropping the frames around them', () => {
    expect(
      resolveConceptPreviewUrls({ images: ['https://cdn/1.png', '  ', 'https://cdn/3.png'] }),
    ).toEqual(['https://cdn/1.png', 'https://cdn/3.png']);
  });
});
