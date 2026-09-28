import { describe, expect, it } from 'bun:test';
import { assetViewSchema, markAssetSeenRequestSchema } from './asset-views';

const ASSET = '11111111-1111-4111-8111-111111111111';

describe('seen by', () => {
  const view = {
    assetId: ASSET,
    brandId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    firstSeenAt: '2026-09-27T10:00:00Z',
    lastSeenAt: '2026-09-27T11:00:00Z',
    viewCount: 2,
  };

  it('parses one person’s view of an asset', () => {
    expect(assetViewSchema.parse(view)).toEqual(view);
    expect(assetViewSchema.safeParse({ ...view, viewCount: 0 }).success).toBe(false);
  });

  it('takes the RPC argument by its PostgREST name', () => {
    expect(markAssetSeenRequestSchema.parse({ p_asset_id: ASSET })).toEqual({ p_asset_id: ASSET });
    expect(markAssetSeenRequestSchema.safeParse({ assetId: ASSET }).success).toBe(false);
  });
});
