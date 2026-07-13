import { describe, expect, it } from 'bun:test';
import {
  buildThumbnailStoragePath,
  isOwnedThumbnailPath,
  thumbnailExtensionFor,
} from './thumbnailStoragePath';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ASSET_ID = '99999999-2222-4333-8444-555555555555';

describe('buildThumbnailStoragePath', () => {
  it('puts the poster in the asset own folder, extension by mime', () => {
    expect(
      buildThumbnailStoragePath({ brandId: BRAND_ID, assetId: ASSET_ID, mimeType: 'image/webp' }),
    ).toBe(`${BRAND_ID}/${ASSET_ID}/thumb.webp`);
    expect(
      buildThumbnailStoragePath({ brandId: BRAND_ID, assetId: ASSET_ID, mimeType: 'image/jpeg' }),
    ).toBe(`${BRAND_ID}/${ASSET_ID}/thumb.jpg`);
  });

  it('refuses a mime type that is not a poster image', () => {
    expect(
      buildThumbnailStoragePath({ brandId: BRAND_ID, assetId: ASSET_ID, mimeType: 'video/mp4' }),
    ).toBeNull();
    expect(
      buildThumbnailStoragePath({ brandId: BRAND_ID, assetId: ASSET_ID, mimeType: 'text/html' }),
    ).toBeNull();
    expect(thumbnailExtensionFor('image/png')).toBeNull();
  });
});

describe('isOwnedThumbnailPath', () => {
  const owner = { brandId: BRAND_ID, assetId: ASSET_ID };

  it('accepts only this asset own poster paths', () => {
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/thumb.webp`, owner)).toBe(true);
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/thumb.jpg`, owner)).toBe(true);
  });

  it('rejects another asset, another brand, traversal, and non-poster leaves', () => {
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${OTHER_ASSET_ID}/thumb.webp`, owner)).toBe(false);
    expect(isOwnedThumbnailPath(`other-brand/${ASSET_ID}/thumb.webp`, owner)).toBe(false);
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/../../evil/thumb.webp`, owner)).toBe(
      false,
    );
    expect(isOwnedThumbnailPath(`/${BRAND_ID}/${ASSET_ID}/thumb.webp`, owner)).toBe(false);
    expect(isOwnedThumbnailPath(`${BRAND_ID}//${ASSET_ID}/thumb.webp`, owner)).toBe(false);
    // Must not let a poster write clobber the asset's own bytes or a version.
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/source.mp4`, owner)).toBe(false);
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/v2/thumb.webp`, owner)).toBe(false);
    expect(isOwnedThumbnailPath(`${BRAND_ID}/${ASSET_ID}/thumb.svg`, owner)).toBe(false);
  });
});
