import { describe, expect, it } from 'bun:test';
import { type ReviewEventRow, reviewEventRowToContract } from './reviewMapping';

const ROW: ReviewEventRow = {
  id: 'event-1',
  brand_id: 'brand-1',
  asset_id: 'asset-1',
  from_status: 'draft',
  to_status: 'in_review',
  actor: 'user-1',
  note: 'ready for review',
  created_at: '2026-07-10T00:00:00.000Z',
};

describe('reviewEventRowToContract', () => {
  it('maps snake_case rows into the strict contracts shape with the resolved actor name', () => {
    const event = reviewEventRowToContract(ROW, 'duane@continuumai.agency');
    expect(event).toEqual({
      id: 'event-1',
      brandId: 'brand-1',
      assetId: 'asset-1',
      fromStatus: 'draft',
      toStatus: 'in_review',
      actor: 'user-1',
      actorName: 'duane@continuumai.agency',
      note: 'ready for review',
      createdAt: '2026-07-10T00:00:00.000Z',
    });
  });

  it("normalizes unknown legacy statuses to 'none' instead of throwing", () => {
    const event = reviewEventRowToContract({ ...ROW, from_status: 'legacy-status' }, null);
    expect(event.fromStatus).toBe('none');
    expect(event.toStatus).toBe('in_review');
    expect(event.actorName).toBeNull();
  });
});
