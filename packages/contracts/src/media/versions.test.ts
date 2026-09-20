import { describe, expect, it } from 'bun:test';
import { registerAssetVersionOperationSchema } from './versions';

const revision = {
  action: 'register_asset_version',
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  bucket: 'media-source',
  storagePath: 'brand/asset/v3-upload/campaign.aep',
  fileName: 'campaign.aep',
  mimeType: 'application/octet-stream',
  sizeBytes: 1024,
  baseVersionId: '33333333-3333-4333-8333-333333333333',
};

describe('registerAssetVersionOperationSchema checksum', () => {
  it('carries the browser sha256 of a revision to the edge function', () => {
    const checksum = 'ab'.repeat(32);
    expect(registerAssetVersionOperationSchema.parse({ ...revision, checksum }).checksum).toBe(
      checksum,
    );
  });

  it('still accepts a revision too large to hash', () => {
    expect(registerAssetVersionOperationSchema.parse(revision).checksum).toBeUndefined();
  });

  it('refuses anything that is not a lowercase sha256 hex digest', () => {
    for (const checksum of ['', 'AB'.repeat(32), 'ab'.repeat(31), 'zz'.repeat(32)]) {
      expect(registerAssetVersionOperationSchema.safeParse({ ...revision, checksum }).success).toBe(
        false,
      );
    }
  });
});
