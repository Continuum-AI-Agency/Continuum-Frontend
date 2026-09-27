import { describe, expect, it } from 'bun:test';
import {
  libraryFoundationActionSchema,
  libraryFoundationOperationSchema,
  registerForgeOutputOperationSchema,
  registerForgeOutputResultSchema,
  requestCollectionReviewOperationSchema,
  requestCollectionReviewResultSchema,
  restoreAssetsOperationSchema,
  restoreAssetsResultSchema,
  setReviewStateLabelsOperationSchema,
  setReviewStateLabelsResultSchema,
  stackAssetsOperationSchema,
  stackAssetsResultSchema,
  updateShareLinkOperationSchema,
  updateShareLinkResultSchema,
} from './library-foundation';
import { DEFAULT_REVIEW_STATE_LABELS } from './review';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ACTOR = '21111111-1111-4111-8111-111111111111';
const A = '31111111-1111-4111-8111-111111111111';
const B = '41111111-1111-4111-8111-111111111111';
const C = '51111111-1111-4111-8111-111111111111';

const base = { brandId: BRAND, actor: ACTOR, idempotencyKey: 'op:1' };

describe('stack_assets', () => {
  const op = { action: 'stack_assets', ...base, targetAssetId: A, sourceAssetIds: [B, C] };

  it('parses a stack and its result', () => {
    expect(stackAssetsOperationSchema.parse(op).sourceAssetIds).toEqual([B, C]);
    expect(
      stackAssetsResultSchema.parse({
        targetAssetId: A,
        stackedAssetIds: [B, C],
        versionIds: [B, C],
        headVersionId: C,
      }).headVersionId,
    ).toBe(C);
  });

  it('rejects the target among its sources, duplicates, and a missing actor', () => {
    expect(stackAssetsOperationSchema.safeParse({ ...op, sourceAssetIds: [A, B] }).success).toBe(
      false,
    );
    expect(stackAssetsOperationSchema.safeParse({ ...op, sourceAssetIds: [B, B] }).success).toBe(
      false,
    );
    expect(stackAssetsOperationSchema.safeParse({ ...op, actor: undefined }).success).toBe(false);
  });
});

describe('restore_assets', () => {
  it('parses a restore and its result', () => {
    expect(
      restoreAssetsOperationSchema.parse({ action: 'restore_assets', ...base, assetIds: [A] })
        .assetIds,
    ).toEqual([A]);
    expect(
      restoreAssetsResultSchema.parse({ restoredAssetIds: [A], refusedAssetIds: [B] })
        .refusedAssetIds,
    ).toEqual([B]);
  });

  it('rejects an empty or oversized batch', () => {
    expect(
      restoreAssetsOperationSchema.safeParse({ action: 'restore_assets', ...base, assetIds: [] })
        .success,
    ).toBe(false);
    const many = Array.from({ length: 251 }, () => A);
    expect(
      restoreAssetsOperationSchema.safeParse({ action: 'restore_assets', ...base, assetIds: many })
        .success,
    ).toBe(false);
  });
});

describe('update_share_link', () => {
  const op = { action: 'update_share_link', ...base, shareLinkId: A };

  it('parses a presentation update and clearing the watermark', () => {
    const parsed = updateShareLinkOperationSchema.parse({
      ...op,
      layout: 'list',
      branding: { accent: '#FF5500', theme: 'light' },
      watermark: null,
      featuredFieldId: null,
      allowDownload: false,
      expiresAt: '2026-10-01T00:00:00+00:00',
      assetOrder: [B, C],
    });
    expect(parsed.watermark).toBeNull();
    expect(parsed.assetOrder).toEqual([B, C]);
  });

  it('rejects an unknown layout, a non-ISO expiry, and an unknown key', () => {
    expect(updateShareLinkOperationSchema.safeParse({ ...op, layout: 'board' }).success).toBe(
      false,
    );
    expect(updateShareLinkOperationSchema.safeParse({ ...op, expiresAt: 'tomorrow' }).success).toBe(
      false,
    );
    expect(updateShareLinkOperationSchema.safeParse({ ...op, passcode: 'x' }).success).toBe(false);
  });

  it('passes the snake_case row through but requires its id', () => {
    const row = { id: A, brand_id: BRAND, layout: 'list', watermark: null };
    expect(updateShareLinkResultSchema.parse(row)).toEqual(row);
    expect(updateShareLinkResultSchema.safeParse({ brand_id: BRAND }).success).toBe(false);
  });
});

describe('request_collection_review', () => {
  const op = {
    action: 'request_collection_review',
    ...base,
    collectionId: A,
    reviewerUserIds: [B],
    note: 'Please check the cuts',
    dueAt: '2026-10-01T12:00:00Z',
  };

  it('parses a request and its fan-out result', () => {
    expect(requestCollectionReviewOperationSchema.parse(op).reviewerUserIds).toEqual([B]);
    expect(
      requestCollectionReviewResultSchema.parse({
        collectionId: A,
        requestIds: [C],
        assetIds: [B],
        skippedAssetIds: [],
      }).requestIds,
    ).toEqual([C]);
  });

  it('rejects no reviewers and an overlong note', () => {
    expect(
      requestCollectionReviewOperationSchema.safeParse({ ...op, reviewerUserIds: [] }).success,
    ).toBe(false);
    expect(
      requestCollectionReviewOperationSchema.safeParse({ ...op, note: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('set_review_state_labels', () => {
  it('parses the default labels and echoes them in the result', () => {
    const labels = [...DEFAULT_REVIEW_STATE_LABELS];
    expect(
      setReviewStateLabelsOperationSchema.parse({
        action: 'set_review_state_labels',
        ...base,
        labels,
      }).labels,
    ).toEqual(labels);
    expect(setReviewStateLabelsResultSchema.parse({ labels }).labels).toHaveLength(5);
  });

  it('rejects a duplicated state and an empty list', () => {
    const [first] = DEFAULT_REVIEW_STATE_LABELS;
    for (const labels of [[first, first], []]) {
      expect(
        setReviewStateLabelsOperationSchema.safeParse({
          action: 'set_review_state_labels',
          ...base,
          labels,
        }).success,
      ).toBe(false);
    }
  });
});

describe('register_forge_output', () => {
  const op = {
    action: 'register_forge_output',
    brandId: BRAND,
    idempotencyKey: 'forge:job:slot',
    slot: 'render-set-1/story/0',
    templateAssetId: A,
    renderSetId: B,
    renderJobId: C,
    templateKey: 'summer-sale',
    bucket: 'media-library',
    storagePath: `${BRAND}/forge/story.mp4`,
    fileName: 'story.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 1_048_576,
    width: 1080,
    height: 1920,
    durationMs: 15_000,
  };

  it('parses a service-registered output with no actor and defaults lineage', () => {
    const parsed = registerForgeOutputOperationSchema.parse(op);
    expect(parsed.actor).toBeUndefined();
    expect(parsed.lineage).toEqual({});
    expect(registerForgeOutputOperationSchema.safeParse({ ...op, actor: null }).success).toBe(true);
    expect(
      registerForgeOutputResultSchema.parse({
        assetId: A,
        versionId: B,
        created: true,
        collectionId: null,
      }).created,
    ).toBe(true);
  });

  it('rejects a document mime type, a missing render job, and a negative size', () => {
    expect(
      registerForgeOutputOperationSchema.safeParse({ ...op, mimeType: 'application/pdf' }).success,
    ).toBe(false);
    expect(
      registerForgeOutputOperationSchema.safeParse({ ...op, renderJobId: undefined }).success,
    ).toBe(false);
    expect(registerForgeOutputOperationSchema.safeParse({ ...op, sizeBytes: -1 }).success).toBe(
      false,
    );
  });
});

describe('libraryFoundationOperationSchema', () => {
  it('routes every foundation action by its literal', () => {
    expect(libraryFoundationActionSchema.options).toHaveLength(6);
    const parsed = libraryFoundationOperationSchema.parse({
      action: 'restore_assets',
      ...base,
      assetIds: [A],
    });
    expect(parsed.action).toBe('restore_assets');
  });

  it('rejects an action outside the foundation set', () => {
    expect(
      libraryFoundationOperationSchema.safeParse({ action: 'bulk_delete_assets', ...base }).success,
    ).toBe(false);
    expect(libraryFoundationActionSchema.safeParse('stack').success).toBe(false);
  });
});
