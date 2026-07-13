import { describe, expect, it } from 'bun:test';
import { mediaAssetSchema } from '@continuum/contracts';
import { rowToMediaAsset, rowToSignedMediaAsset } from '../mapper';
import type { MediaAssetRow } from '../schema';
import { assetSignablePaths } from '../signed-urls';

const videoRow: MediaAssetRow = {
  id: 'asset-1',
  brand_id: 'brand-1',
  created_by: 'user-1',
  kind: 'video',
  bucket: 'media-library',
  storage_path: 'brand-1/asset-1/clip.mp4',
  file_name: 'clip.mp4',
  mime_type: 'video/mp4',
  size_bytes: 4_200_000,
  width: 1080,
  height: 1920,
  duration_ms: 12_000,
  source: 'upload',
  origin_ref: null,
  status: 'ready',
  review_status: 'none',
  checksum: null,
  progress_step: null,
  error_code: null,
  error_message: null,
  title: 'Spring teaser',
  description: 'A 12s teaser.',
  tags: [],
  ad_creative_analysis: null,
  detected_objects: null,
  thumbnail_path: 'brand-1/asset-1/thumb.webp',
  embedding_model: null,
  has_image_embedding: false,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
  deleted_at: null,
};

describe('poster columns', () => {
  it('maps thumbnail_path onto the contract asset and stays schema-valid', () => {
    const asset = rowToMediaAsset(videoRow);
    expect(asset.thumbnailPath).toBe('brand-1/asset-1/thumb.webp');
    expect(mediaAssetSchema.safeParse(asset).success).toBe(true);
  });

  it('leaves thumbnailPath null on a row that has no poster', () => {
    const { thumbnail_path: _omitted, ...withoutPoster } = videoRow;
    expect(rowToMediaAsset(withoutPoster as MediaAssetRow).thumbnailPath).toBeNull();
  });

  it('signs the poster from the asset own bucket, alongside the asset', () => {
    expect(assetSignablePaths([videoRow])).toEqual([
      { path: 'brand-1/asset-1/clip.mp4', bucket: 'media-library' },
      { path: 'brand-1/asset-1/thumb.webp', bucket: 'media-library' },
    ]);
  });

  it('omits the poster from signing when the row has none', () => {
    const { thumbnail_path: _omitted, ...withoutPoster } = videoRow;
    expect(assetSignablePaths([withoutPoster as MediaAssetRow])).toEqual([
      { path: 'brand-1/asset-1/clip.mp4', bucket: 'media-library' },
    ]);
  });

  it('resolves both signed URLs from the batch-signing map', () => {
    const signed = new Map([
      ['brand-1/asset-1/clip.mp4', 'https://signed/clip.mp4?token=a'],
      ['brand-1/asset-1/thumb.webp', 'https://signed/thumb.webp?token=b'],
    ]);
    const asset = rowToSignedMediaAsset(videoRow, signed);
    expect(asset.signedUrl).toBe('https://signed/clip.mp4?token=a');
    expect(asset.thumbnailUrl).toBe('https://signed/thumb.webp?token=b');
    expect(asset.thumbnailPath).toBe('brand-1/asset-1/thumb.webp');
  });

  it('degrades to no poster URL when the poster failed to sign', () => {
    const signed = new Map([['brand-1/asset-1/clip.mp4', 'https://signed/clip.mp4?token=a']]);
    const asset = rowToSignedMediaAsset(videoRow, signed);
    expect(asset.signedUrl).toBe('https://signed/clip.mp4?token=a');
    expect(asset.thumbnailUrl).toBeNull();
  });
});
