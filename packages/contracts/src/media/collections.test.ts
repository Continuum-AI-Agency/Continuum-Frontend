import { describe, expect, it } from 'bun:test';
import {
  bulkDeleteAssetsOperationSchema,
  bulkSetAssetFieldValueOperationSchema,
  bulkTransitionAssetReviewOperationSchema,
  bulkUpdateAssetTagsOperationSchema,
  createLibraryCollectionOperationSchema,
  mergeLibraryTagsOperationSchema,
  mutateCollectionMembershipOperationSchema,
  renameLibraryTagOperationSchema,
} from './collections';

const BRAND = '6c92770d-dc9d-4cc1-aebd-aed97fc240a1';
const ASSET = 'de229024-d9fd-4306-bae6-389b79108554';
const COLLECTION = '23ab8326-76ab-4f09-9291-b9a5bff59371';

describe('Library collection commands', () => {
  it('nests a manual collection under a parent board', () => {
    expect(
      createLibraryCollectionOperationSchema.parse({
        action: 'create_library_collection',
        brandId: BRAND,
        name: 'Cuts',
        parentId: COLLECTION,
      }).parentId,
    ).toBe(COLLECTION);
  });

  it('refuses to nest a smart collection', () => {
    expect(
      createLibraryCollectionOperationSchema.safeParse({
        action: 'create_library_collection',
        brandId: BRAND,
        name: 'Needs review',
        kind: 'smart',
        parentId: COLLECTION,
        smartQuery: { brandId: BRAND },
      }).success,
    ).toBe(false);
  });

  it('requires a canonical browse query for smart collections', () => {
    expect(
      createLibraryCollectionOperationSchema.safeParse({
        action: 'create_library_collection',
        brandId: BRAND,
        name: 'Needs review',
        kind: 'smart',
      }).success,
    ).toBe(false);
  });

  it('accepts bounded multi-asset membership changes', () => {
    expect(
      mutateCollectionMembershipOperationSchema.safeParse({
        action: 'mutate_collection_membership',
        brandId: BRAND,
        collectionId: COLLECTION,
        assetIds: [ASSET],
        mode: 'add',
      }).success,
    ).toBe(true);
  });

  it('requires an actual tag change', () => {
    expect(
      bulkUpdateAssetTagsOperationSchema.safeParse({
        action: 'bulk_update_asset_tags',
        brandId: BRAND,
        assetIds: [ASSET],
      }).success,
    ).toBe(false);
  });

  it('accepts bounded bulk workflow and field changes', () => {
    expect(
      bulkTransitionAssetReviewOperationSchema.safeParse({
        action: 'bulk_transition_asset_review',
        brandId: BRAND,
        assetIds: [ASSET],
        toStatus: 'in_review',
      }).success,
    ).toBe(true);
    expect(
      bulkSetAssetFieldValueOperationSchema.safeParse({
        action: 'bulk_set_asset_field_value',
        brandId: BRAND,
        assetIds: [ASSET],
        fieldId: COLLECTION,
        value: 'r5',
      }).success,
    ).toBe(true);
  });

  it('deletes a bounded, non-empty selection of assets', () => {
    expect(
      bulkDeleteAssetsOperationSchema.safeParse({
        action: 'bulk_delete_assets',
        brandId: BRAND,
        assetIds: [ASSET],
      }).success,
    ).toBe(true);
    // An empty selection would delete nothing but still burn an idempotency receipt.
    expect(
      bulkDeleteAssetsOperationSchema.safeParse({
        action: 'bulk_delete_assets',
        brandId: BRAND,
        assetIds: [],
      }).success,
    ).toBe(false);
    // The server caps the batch at 250; the client must not send more.
    expect(
      bulkDeleteAssetsOperationSchema.safeParse({
        action: 'bulk_delete_assets',
        brandId: BRAND,
        assetIds: Array.from({ length: 251 }, () => ASSET),
      }).success,
    ).toBe(false);
    // Strict: a stray field must not ride along to an irreversible-looking operation.
    expect(
      bulkDeleteAssetsOperationSchema.safeParse({
        action: 'bulk_delete_assets',
        brandId: BRAND,
        assetIds: [ASSET],
        hard: true,
      }).success,
    ).toBe(false);
  });

  it('accepts brand-scoped tag rename and merge commands', () => {
    expect(
      renameLibraryTagOperationSchema.parse({
        action: 'rename_library_tag',
        brandId: BRAND,
        fromTag: 'Video',
        toTag: 'Motion',
      }).toTag,
    ).toBe('Motion');
    expect(
      mergeLibraryTagsOperationSchema.safeParse({
        action: 'merge_library_tags',
        brandId: BRAND,
        sourceTags: ['reels', 'short form'],
        targetTag: 'short-form',
      }).success,
    ).toBe(true);
  });

  it('protects system tags and rejects self-merges', () => {
    expect(
      renameLibraryTagOperationSchema.safeParse({
        action: 'rename_library_tag',
        brandId: BRAND,
        fromTag: '__carousel_slide',
        toTag: 'slide',
      }).success,
    ).toBe(false);
    expect(
      mergeLibraryTagsOperationSchema.safeParse({
        action: 'merge_library_tags',
        brandId: BRAND,
        sourceTags: ['Reel'],
        targetTag: 'reel',
      }).success,
    ).toBe(false);
  });
});
