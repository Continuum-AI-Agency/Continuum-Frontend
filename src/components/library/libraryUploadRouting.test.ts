import { describe, expect, test } from 'bun:test';
import { partitionLibraryUploadFiles } from './libraryUploadRouting';

describe('partitionLibraryUploadFiles', () => {
  test('sends every font in a mixed Library selection to metadata review', () => {
    const font = new File(['font'], 'Heading-Bold.otf', { type: 'font/otf' });
    const video = new File(['video'], 'spot.mp4', { type: 'video/mp4' });

    expect(partitionLibraryUploadFiles([video, font])).toEqual({ fonts: [font], media: [video] });
    expect(partitionLibraryUploadFiles([font])).toEqual({ fonts: [font], media: [] });
  });
});
