// Regression tests for the storage-location trust bug: register calls carry a
// client-supplied bucket + storage_path, and the head row they promote is what
// every later signed URL is minted from. A forged location must be rejected
// before it can be persisted.

import { describe, expect, it } from 'bun:test';
import { isOwnedVersionLocation } from '../versionMapping';

const owner = {
  brandId: '00000000-0000-0000-0000-0000000000b1',
  assetId: '11111111-1111-1111-1111-111111111111',
  bucket: 'media-library',
};

describe('isOwnedVersionLocation', () => {
  it('accepts the path the sign step mints', () => {
    expect(
      isOwnedVersionLocation(
        {
          bucket: 'media-library',
          storagePath: `${owner.brandId}/${owner.assetId}/v2/hero.png`,
        },
        owner,
      ),
    ).toBe(true);
  });

  it("rejects another brand's object", () => {
    expect(
      isOwnedVersionLocation(
        {
          bucket: 'media-library',
          storagePath: '99999999-9999-9999-9999-999999999999/aaaa/secret.png',
        },
        owner,
      ),
    ).toBe(false);
  });

  it("rejects another asset's prefix inside the same brand", () => {
    expect(
      isOwnedVersionLocation(
        {
          bucket: 'media-library',
          storagePath: `${owner.brandId}/22222222-2222-2222-2222-222222222222/v2/hero.png`,
        },
        owner,
      ),
    ).toBe(false);
  });

  it('rejects a bucket swap away from the asset home bucket', () => {
    expect(
      isOwnedVersionLocation(
        {
          bucket: 'media-source',
          storagePath: `${owner.brandId}/${owner.assetId}/v2/hero.png`,
        },
        owner,
      ),
    ).toBe(false);
  });

  it('rejects a prefix-collision path (brand id as a string prefix only)', () => {
    expect(
      isOwnedVersionLocation(
        {
          bucket: 'media-library',
          storagePath: `${owner.brandId}/${owner.assetId}-evil/v2/hero.png`,
        },
        owner,
      ),
    ).toBe(false);
  });
});
