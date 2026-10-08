import { describe, expect, it } from 'bun:test';
import { reorderAssetVersionsRequestSchema } from './library-versions';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('reorderAssetVersionsRequestSchema', () => {
  it('needs at least two distinct versions', () => {
    const base = { brandId: A, assetId: A, idempotencyKey: 'k' };
    expect(reorderAssetVersionsRequestSchema.safeParse({ ...base, versionIds: [A, B] }).success).toBe(true);
    expect(reorderAssetVersionsRequestSchema.safeParse({ ...base, versionIds: [A, A] }).success).toBe(false);
    expect(reorderAssetVersionsRequestSchema.safeParse({ ...base, versionIds: [A] }).success).toBe(false);
  });
});
