import { describe, expect, it } from 'bun:test';
import { mediaAssetSchema } from '@continuum/contracts';
import { rowToMediaAsset } from '../mapper';
import type { MediaAssetRow } from '../schema';

const baseRow: MediaAssetRow = {
  id: 'asset-1',
  brand_id: 'brand-1',
  created_by: 'user-1',
  kind: 'image',
  bucket: 'media-library',
  storage_path: 'brand-1/asset-1/photo.jpg',
  file_name: 'photo.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 204800,
  width: 1920,
  height: 1080,
  duration_ms: null,
  source: 'upload',
  origin_ref: null,
  status: 'ready',
  review_status: 'in_review',
  checksum: 'sha256:abc123',
  progress_step: null,
  error_code: null,
  error_message: null,
  title: 'A beautiful sunset',
  description: 'A scenic photo of a sunset over the ocean.',
  tags: ['sunset'],
  ad_creative_analysis: null,
  detected_objects: null,
  embedding_model: null,
  has_image_embedding: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T01:00:00Z',
  deleted_at: null,
};

describe('rowToMediaAsset review workflow columns', () => {
  it('maps review_status and checksum', () => {
    const asset = rowToMediaAsset(baseRow);
    expect(asset.reviewStatus).toBe('in_review');
    expect(asset.checksum).toBe('sha256:abc123');
  });

  it("defaults reviewStatus to 'none' and checksum to null for pre-v2 payloads", () => {
    const { review_status: _rs, checksum: _cs, ...legacy } = baseRow;
    const asset = rowToMediaAsset(legacy as MediaAssetRow);
    expect(asset.reviewStatus).toBe('none');
    expect(asset.checksum).toBeNull();
  });

  it("tolerates kind 'file' rows", () => {
    const row: MediaAssetRow = {
      ...baseRow,
      kind: 'file',
      mime_type: 'application/octet-stream',
      file_name: 'project.aep',
    };
    const asset = rowToMediaAsset(row);
    expect(asset.kind).toBe('file');
  });

  it('produces output that passes mediaAssetSchema.safeParse', () => {
    const result = mediaAssetSchema.safeParse(rowToMediaAsset(baseRow));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reviewStatus).toBe('in_review');
      expect(result.data.checksum).toBe('sha256:abc123');
    }
  });
});
