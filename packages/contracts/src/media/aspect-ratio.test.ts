import { describe, expect, it } from 'bun:test';
import {
  LIBRARY_ASPECT_RATIO_LABEL,
  libraryAspectRatioBin,
  placementPreviewCrops,
  previewFrameForBin,
} from './aspect-ratio';

describe('libraryAspectRatioBin', () => {
  it('shelves common delivery sizes', () => {
    expect(libraryAspectRatioBin(1080, 1920)).toBe('9:16');
    expect(libraryAspectRatioBin(1080, 1080)).toBe('1:1');
    expect(libraryAspectRatioBin(1080, 1350)).toBe('4:5');
    expect(libraryAspectRatioBin(1920, 1080)).toBe('16:9');
  });

  it('does not dump unknown pixels onto a named shelf', () => {
    expect(libraryAspectRatioBin(1200, 628)).toBe('other');
  });

  it('leaves missing dimensions un-shelved', () => {
    expect(libraryAspectRatioBin(null, 1080)).toBeNull();
    expect(libraryAspectRatioBin(1080, 0)).toBeNull();
  });

  it('names shelves by the surface they play on', () => {
    expect(LIBRARY_ASPECT_RATIO_LABEL['9:16']).toBe('Story · phone');
    expect(LIBRARY_ASPECT_RATIO_LABEL['16:9']).toBe('Landscape · TV');
    expect(previewFrameForBin('9:16')).toBe('story');
  });

  it('a 16:9 into a story frame is a crop; a 9:16 is not', () => {
    expect(placementPreviewCrops(1920, 1080, 'story')).toBe(true);
    expect(placementPreviewCrops(1080, 1920, 'story')).toBe(false);
    expect(placementPreviewCrops(1080, 1920, 'native')).toBe(false);
  });
});
