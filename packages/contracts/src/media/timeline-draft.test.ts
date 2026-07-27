import { describe, expect, it } from 'bun:test';
import {
  getTimelineDraftResponseSchema,
  TIMELINE_DRAFT_SCHEMA_VERSION,
  timelineDraftDocumentSchema,
  upsertTimelineDraftRequestSchema,
} from './timeline-draft';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const BRAND = '00000000-0000-4000-8000-0000000000b2';

function validDocument() {
  return {
    schemaVersion: TIMELINE_DRAFT_SCHEMA_VERSION,
    sourceAssetId: ASSET_A,
    pool: [
      { assetId: ASSET_A, kind: 'video' as const, label: 'Hero cut', durationSec: 12.5 },
      { assetId: ASSET_B, kind: 'image' as const, label: 'End card' },
    ],
    items: [
      {
        id: 'item-1',
        order: 0,
        sourceId: ASSET_A,
        kind: 'video' as const,
        trimStartSec: 1.5,
        trimEndSec: 8,
        transition: { type: 'crossDissolve' as const, durationSec: 0.4 },
        effects: { speed: 2, unknownFutureKnob: { nested: true } },
      },
    ],
  };
}

describe('timelineDraftDocumentSchema', () => {
  it('accepts a full document and preserves opaque effects', () => {
    const parsed = timelineDraftDocumentSchema.parse(validDocument());
    expect(parsed.items[0]?.effects).toEqual({ speed: 2, unknownFutureKnob: { nested: true } });
    expect(parsed.pool).toHaveLength(2);
  });

  it('accepts additive audio pool members and absolute-time audio tracks', () => {
    const parsed = timelineDraftDocumentSchema.parse({
      ...validDocument(),
      pool: [
        ...validDocument().pool,
        { assetId: BRAND, kind: 'audio', label: 'Voiceover', durationSec: 6 },
      ],
      audioTracks: [
        {
          id: 'voiceover-lane',
          kind: 'audio',
          items: [
            {
              id: 'voiceover-1',
              order: 0,
              sourceId: BRAND,
              kind: 'audio',
              startSec: 1.25,
              trimStartSec: 0.5,
              trimEndSec: 4,
              volume: 0.75,
              audioFadeInSec: 0.2,
              audioFadeOutSec: 0.4,
            },
          ],
        },
      ],
    });

    expect(parsed.audioTracks?.[0]?.items[0]).toMatchObject({
      kind: 'audio',
      startSec: 1.25,
      volume: 0.75,
    });
  });

  it('rejects a document with no schemaVersion envelope', () => {
    const { schemaVersion: _dropped, ...rest } = validDocument();
    expect(timelineDraftDocumentSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a future schemaVersion (the envelope is the upgrade seam)', () => {
    const result = timelineDraftDocumentSchema.safeParse({ ...validDocument(), schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    const result = timelineDraftDocumentSchema.safeParse({
      ...validDocument(),
      rogueField: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid source id', () => {
    const document = validDocument();
    document.items[0]!.sourceId = 'canvas-node-7';
    expect(timelineDraftDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects an unsupported transition type', () => {
    const document = validDocument();
    // @ts-expect-error — proving the enum is enforced, not just typed.
    document.items[0]!.transition = { type: 'barrelRoll', durationSec: 0.4 };
    expect(timelineDraftDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('caps the media bin at 24 sources', () => {
    const document = validDocument();
    document.pool = Array.from({ length: 25 }, (_unused, index) => ({
      assetId: ASSET_A,
      kind: 'video' as const,
      label: `clip ${index}`,
      durationSec: 1,
    }));
    expect(timelineDraftDocumentSchema.safeParse(document).success).toBe(false);
  });
});

describe('upsertTimelineDraftRequestSchema', () => {
  it('accepts a draft upsert with a rendered status', () => {
    const parsed = upsertTimelineDraftRequestSchema.parse({
      brandId: BRAND,
      assetId: ASSET_A,
      document: validDocument(),
      status: 'rendered',
      renderedAssetId: ASSET_B,
    });
    expect(parsed.status).toBe('rendered');
  });

  it('rejects an invalid status', () => {
    const result = upsertTimelineDraftRequestSchema.safeParse({
      brandId: BRAND,
      assetId: ASSET_A,
      document: validDocument(),
      status: 'published',
    });
    expect(result.success).toBe(false);
  });
});

describe('getTimelineDraftResponseSchema', () => {
  it('accepts a null draft with empty pool media', () => {
    expect(getTimelineDraftResponseSchema.parse({ draft: null, poolMedia: [] }).draft).toBeNull();
  });

  it('accepts a pool member whose asset has been deleted', () => {
    const parsed = getTimelineDraftResponseSchema.parse({
      draft: null,
      poolMedia: [{ assetId: ASSET_B, signedUrl: null, kind: null, durationMs: null, label: null }],
    });
    expect(parsed.poolMedia[0]?.signedUrl).toBeNull();
  });
});
