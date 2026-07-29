import { describe, expect, it } from 'bun:test';
import {
  completeMcpUploadIntentRequestSchema,
  libraryAssetRefSchema,
  libraryImageRefSchema,
  pinnedLibraryAssetRefSchema,
  pinnedLibraryImageRefSchema,
} from './library-reference';

describe('libraryImageRefSchema', () => {
  it('accepts a stable asset reference with an optional pinned version', () => {
    expect(
      libraryImageRefSchema.parse({
        asset_id: '11111111-1111-4111-8111-111111111111',
        version_id: '22222222-2222-4222-8222-222222222222',
      }),
    ).toEqual({
      asset_id: '11111111-1111-4111-8111-111111111111',
      version_id: '22222222-2222-4222-8222-222222222222',
    });

    expect(
      libraryImageRefSchema.parse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      asset_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects non-uuid identities and unknown fields', () => {
    expect(libraryImageRefSchema.safeParse({ asset_id: 'asset-1' }).success).toBe(false);
    expect(
      libraryImageRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
        storage_path: 'do-not-cross-this-boundary',
      }).success,
    ).toBe(false);
  });

  it('requires a pinned version before an upload intent can complete', () => {
    expect(
      pinnedLibraryImageRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      completeMcpUploadIntentRequestSchema.safeParse({
        action: 'complete_mcp_upload_intent',
        brandId: '11111111-1111-4111-8111-111111111111',
        uploadIntentId: '22222222-2222-4222-8222-222222222222',
        assetRefs: [
          {
            asset_id: '33333333-3333-4333-8333-333333333333',
            version_id: '44444444-4444-4444-8444-444444444444',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('generic Library asset references', () => {
  it('uses the same database asset/version identity for images and videos', () => {
    const ref = {
      asset_id: '11111111-1111-4111-8111-111111111111',
      version_id: '22222222-2222-4222-8222-222222222222',
    };
    expect(libraryAssetRefSchema.parse(ref)).toEqual(ref);
    expect(pinnedLibraryAssetRefSchema.parse(ref)).toEqual(ref);
  });

  it('requires a version at durable workflow boundaries', () => {
    expect(
      pinnedLibraryAssetRefSchema.safeParse({
        asset_id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });
});
