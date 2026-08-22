import { describe, expect, it } from 'bun:test';
import { withForcedDownload } from './downloadUrl';

describe('withForcedDownload', () => {
  it('opens the query string when the url has none', () => {
    expect(withForcedDownload('https://cdn.example.com/storage/asset.mp4', 'asset.mp4')).toBe(
      'https://cdn.example.com/storage/asset.mp4?download=asset.mp4',
    );
  });

  it('appends to an existing query string', () => {
    expect(
      withForcedDownload(
        'https://project.supabase.co/storage/v1/object/sign/media/a.png?token=abc.def-ghi',
        'a.png',
      ),
    ).toBe(
      'https://project.supabase.co/storage/v1/object/sign/media/a.png?token=abc.def-ghi&download=a.png',
    );
  });

  it('percent-encodes spaces, hashes, ampersands, and non-ASCII in the file name', () => {
    expect(
      withForcedDownload('https://cdn.example.com/a.mp4', 'Reel #3 rough & final — ñandú.mp4'),
    ).toBe(
      'https://cdn.example.com/a.mp4?download=Reel%20%233%20rough%20%26%20final%20%E2%80%94%20%C3%B1and%C3%BA.mp4',
    );
  });

  it('leaves blob and data urls byte-identical', () => {
    const blobUrl = 'blob:https://app.trycontinuum.ai/2a1f-4c9e';
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    expect(withForcedDownload(blobUrl, 'render.png')).toBe(blobUrl);
    expect(withForcedDownload(dataUrl, 'render.png')).toBe(dataUrl);
  });

  it('does not append a second download param', () => {
    const alreadyForced = 'https://cdn.example.com/a.mp4?token=abc&download=a.mp4';
    expect(withForcedDownload(alreadyForced, 'other.mp4')).toBe(alreadyForced);
    const emptyValue = 'https://cdn.example.com/a.mp4?download=';
    expect(withForcedDownload(emptyValue, 'a.mp4')).toBe(emptyValue);
  });

  it('still appends when a different param merely ends in download', () => {
    expect(withForcedDownload('https://cdn.example.com/a.mp4?nodownload=1', 'a.mp4')).toBe(
      'https://cdn.example.com/a.mp4?nodownload=1&download=a.mp4',
    );
  });
});
