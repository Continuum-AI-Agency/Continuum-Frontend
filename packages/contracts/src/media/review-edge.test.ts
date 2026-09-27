import { describe, expect, it } from 'bun:test';
import { mediaReviewStatusSchema } from './asset';
import { REVIEW_EDGE_STATES, reviewEdgeRequestSchema } from './review-edge';

const brandId = '11111111-1111-4111-8111-111111111111';

describe('reviewEdgeRequestSchema', () => {
  it('names exactly the review states the asset schema knows', () => {
    expect([...REVIEW_EDGE_STATES]).toEqual([...mediaReviewStatusSchema.options]);
  });

  it('accepts a label set and refuses a non-hex colour', () => {
    const labels = [{ state: 'approved', label: 'Client OK', color: '#123456', position: 4 }];
    expect(
      reviewEdgeRequestSchema.safeParse({ action: 'set_review_state_labels', brandId, labels })
        .success,
    ).toBe(true);
    expect(
      reviewEdgeRequestSchema.safeParse({
        action: 'set_review_state_labels',
        brandId,
        labels: [{ ...labels[0], color: 'red' }],
      }).success,
    ).toBe(false);
  });

  it('requires a reviewer and refuses a caller-supplied actor', () => {
    const base = { action: 'request_collection_review', brandId, collectionId: brandId };
    expect(reviewEdgeRequestSchema.safeParse({ ...base, reviewerUserIds: [] }).success).toBe(false);
    expect(
      reviewEdgeRequestSchema.safeParse({ ...base, reviewerUserIds: [brandId], actor: brandId })
        .success,
    ).toBe(false);
    expect(reviewEdgeRequestSchema.safeParse({ ...base, reviewerUserIds: [brandId] }).success).toBe(
      true,
    );
  });

  it('accepts custom states alone, and refuses a request with neither list', () => {
    const customStates = [
      { label: 'Legal review', color: '#8B5CF6', baseStatus: 'in_review', position: 0 },
    ];
    expect(
      reviewEdgeRequestSchema.safeParse({
        action: 'set_review_state_labels',
        brandId,
        customStates,
      }).success,
    ).toBe(true);
    expect(
      reviewEdgeRequestSchema.safeParse({ action: 'set_review_state_labels', brandId }).success,
    ).toBe(false);
    expect(
      reviewEdgeRequestSchema.safeParse({
        action: 'set_review_state_labels',
        brandId,
        customStates: [{ ...customStates[0], baseStatus: 'shipped' }],
      }).success,
    ).toBe(false);
  });

  it('sets a state on a named version, and needs a status or a state', () => {
    const base = { action: 'set_asset_review_state', brandId, assetId: brandId };
    expect(
      reviewEdgeRequestSchema.safeParse({ ...base, versionId: brandId, stateId: brandId }).success,
    ).toBe(true);
    expect(reviewEdgeRequestSchema.safeParse({ ...base, toStatus: 'approved' }).success).toBe(true);
    expect(reviewEdgeRequestSchema.safeParse(base).success).toBe(false);
    expect(
      reviewEdgeRequestSchema.safeParse({ ...base, toStatus: 'approved', actor: brandId }).success,
    ).toBe(false);
  });
});
