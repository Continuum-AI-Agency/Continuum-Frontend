import { describe, expect, it } from 'bun:test';
import { toBrowserReachableStorageUrl } from './storage-url';

describe('toBrowserReachableStorageUrl', () => {
  it('rewrites the local Docker kong origin to the browser Supabase origin', () => {
    expect(
      toBrowserReachableStorageUrl(
        'http://kong:8000/storage/v1/object/sign/media-library/brand/asset.mp4?token=signed',
        'http://127.0.0.1:54321',
      ),
    ).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/media-library/brand/asset.mp4?token=signed',
    );
  });

  it('does not rewrite a production or CDN signed origin', () => {
    const signed = 'https://cdn.example.com/storage/object?token=signed';
    expect(toBrowserReachableStorageUrl(signed, 'https://project.supabase.co')).toBe(signed);
  });

  it('leaves malformed input unchanged', () => {
    expect(toBrowserReachableStorageUrl('not a url', 'http://127.0.0.1:54321')).toBe('not a url');
  });
});
