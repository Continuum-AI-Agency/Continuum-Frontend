import { describe, expect, it } from 'bun:test';
import { type AssetRenditionRow, buildAssetPreview } from './renditions';
import type { MediaAssetRow } from './schema';

const asset = (kind: 'image' | 'video' | 'file'): MediaAssetRow =>
  ({
    id: '33333333-3333-4333-8333-333333333333',
    brand_id: '22222222-2222-4222-8222-222222222222',
    kind,
    bucket: kind === 'file' ? 'media-source' : 'media-library',
    storage_path: 'source/original',
    file_name: 'source',
    mime_type: kind === 'video' ? 'video/mp4' : kind === 'image' ? 'image/png' : 'application/pdf',
    source: 'upload',
    origin_ref: null,
    status: 'stored',
    head_version_id: '44444444-4444-4444-8444-444444444444',
    progress_step: null,
    error_code: null,
    error_message: null,
    title: null,
    description: null,
    tags: [],
    ad_creative_analysis: null,
    detected_objects: null,
    embedding_model: null,
    has_image_embedding: false,
    created_at: '2026-07-16T00:00:00Z',
    updated_at: '2026-07-16T00:00:00Z',
    deleted_at: null,
    created_by: null,
    size_bytes: null,
    width: null,
    height: null,
    duration_ms: null,
  }) as MediaAssetRow;

const rendition: AssetRenditionRow = {
  id: '55555555-5555-4555-8555-555555555555',
  brand_id: '22222222-2222-4222-8222-222222222222',
  asset_id: '33333333-3333-4333-8333-333333333333',
  asset_version_id: '44444444-4444-4444-8444-444444444444',
  role: 'preview_image',
  state: 'ready',
  bucket: 'media-previews',
  storage_path: 'preview/render.webp',
  mime_type: 'image/webp',
  width: 800,
  height: 600,
  duration_ms: null,
  error_code: null,
  created_at: '2026-07-16T00:00:00Z',
  updated_at: '2026-07-16T00:00:00Z',
};

describe('buildAssetPreview', () => {
  it('uses an exact-version rendition for a source file', () => {
    expect(
      buildAssetPreview(asset('file'), [rendition], new Map([['preview/render.webp', 'https://p']]))
        ?.signedUrl,
    ).toBe('https://p');
  });

  it('falls back to the exact head original for native images', () => {
    expect(
      buildAssetPreview(asset('image'), [], new Map([['source/original', 'https://original']])),
    ).toMatchObject({ state: 'ready', kind: 'image', signedUrl: 'https://original' });
  });

  it('preserves an awaiting-companion state for a design source', () => {
    expect(
      buildAssetPreview(
        asset('file'),
        [{ ...rendition, state: 'awaiting_companion', storage_path: null, mime_type: null }],
        new Map(),
      ),
    ).toMatchObject({ state: 'awaiting_companion', kind: null, signedUrl: null });
  });

  it('prefers a webp poster rendition (kind image) over the raw video head', () => {
    const poster: AssetRenditionRow = {
      ...rendition,
      id: '66666666-6666-4666-8666-666666666666',
      role: 'poster',
      storage_path: 'preview/poster.webp',
      mime_type: 'image/webp',
    };
    expect(
      buildAssetPreview(
        asset('video'),
        [poster],
        new Map([
          ['preview/poster.webp', 'https://poster'],
          ['source/original', 'https://raw-video'],
        ]),
      ),
    ).toMatchObject({
      state: 'ready',
      kind: 'image',
      role: 'poster',
      signedUrl: 'https://poster',
    });
  });
});
