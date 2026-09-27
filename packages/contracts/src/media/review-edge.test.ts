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
});
