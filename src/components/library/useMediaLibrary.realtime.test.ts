import { describe, expect, it } from 'bun:test';
import { rowToMediaAsset } from '@/lib/media/mapper';
import type { MediaAssetRow } from '@/lib/media/schema';
import { applyRealtimeUpdate } from './useMediaLibrary';

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
  progress_step: null,
  error_code: null,
  error_message: null,
  title: 'A beautiful sunset',
  description: null,
  tags: ['sunset'],
  ad_creative_analysis: null,
  detected_objects: null,
  embedding_model: null,
  has_image_embedding: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T01:00:00Z',
  deleted_at: null,
};

const otherRow: MediaAssetRow = { ...baseRow, id: 'asset-2', file_name: 'other.jpg' };
const grid = [rowToMediaAsset(baseRow), rowToMediaAsset(otherRow)];

describe('applyRealtimeUpdate', () => {
  it('merges an ordinary update in place', () => {
    const next = applyRealtimeUpdate(grid, {
      ...baseRow,
      title: 'Renamed',
      tags: ['sunset', 'hero'],
    });

    expect(next).toHaveLength(2);
    expect(next[0]?.title).toBe('Renamed');
    expect(next[0]?.tags).toEqual(['sunset', 'hero']);
    // The merge must not drop fields Realtime never carries.
    expect(next[0]?.signedUrl).toBe(grid[0]?.signedUrl ?? null);
    expect(next[1]?.id).toBe('asset-2');
  });

  it('removes a row that the update soft-deleted', () => {
    // A delete reaches the grid as an UPDATE stamping deleted_at, never as a DELETE.
    // Merging it would leave a deleted asset on screen until the next full fetch.
    const next = applyRealtimeUpdate(grid, {
      ...baseRow,
      deleted_at: '2026-09-06T12:00:00Z',
    });

    expect(next.map((asset) => asset.id)).toEqual(['asset-2']);
  });

  it('leaves the grid untouched when the row is not on this page', () => {
    const next = applyRealtimeUpdate(grid, { ...baseRow, id: 'asset-99' });

    expect(next.map((asset) => asset.id)).toEqual(['asset-1', 'asset-2']);
  });
});
