import { describe, expect, it } from 'bun:test';
import { type MediaAsset, type MediaReviewStatus, mediaAssetSchema } from '@continuum/contracts';
import { groupAssetsByReviewStatus } from './groupAssetsByReviewStatus';

function makeAsset(id: string, reviewStatus?: MediaReviewStatus): MediaAsset {
  return mediaAssetSchema.parse({
    id,
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: `brand-1/${id}/file.png`,
    fileName: 'file.png',
    mimeType: 'image/png',
    source: 'upload',
    status: 'ready',
    ...(reviewStatus ? { reviewStatus } : {}),
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  });
}

describe('groupAssetsByReviewStatus', () => {
  it('creates every column even when empty', () => {
    const columns = groupAssetsByReviewStatus([]);
    expect(Object.keys(columns).sort()).toEqual(
      ['none', 'draft', 'in_review', 'needs_changes', 'approved'].sort(),
    );
    expect(columns.approved).toEqual([]);
  });

  it('buckets assets by status preserving order within a column', () => {
    const first = makeAsset('a1', 'draft');
    const second = makeAsset('a2', 'approved');
    const third = makeAsset('a3', 'draft');
    const columns = groupAssetsByReviewStatus([first, second, third]);
    expect(columns.draft.map((asset) => asset.id)).toEqual(['a1', 'a3']);
    expect(columns.approved.map((asset) => asset.id)).toEqual(['a2']);
    expect(columns.none).toEqual([]);
  });

  it("lands unknown or missing statuses in the 'none' (Unsorted) column", () => {
    const legacy = { ...makeAsset('legacy'), reviewStatus: 'bogus' as MediaReviewStatus };
    const missing = { ...makeAsset('missing') } as MediaAsset & { reviewStatus?: unknown };
    delete missing.reviewStatus;
    const columns = groupAssetsByReviewStatus([legacy, missing as MediaAsset]);
    expect(columns.none.map((asset) => asset.id)).toEqual(['legacy', 'missing']);
  });
});
