import { describe, expect, it } from 'bun:test';
import type { MediaAsset, TimelineDraftDocument } from '@continuum/contracts';
import { TIMELINE_DRAFT_SCHEMA_VERSION, timelineDraftDocumentSchema } from '@continuum/contracts';
import type { TimelineDocument } from '@/StudioCanvas/nodes/timeline/adapter';
import {
  draftPoolToSources,
  fromDraftDocument,
  type LibraryPoolSource,
  seedTimelineDocumentFromAsset,
  toDraftDocument,
} from './timelineDraftMapping';

const SOURCE_ASSET_ID = '11111111-1111-4111-8111-111111111111';
const OVERLAY_ASSET_ID = '22222222-2222-4222-8222-222222222222';

// Deliberately carries keys this Frontend build does not know about: `effects`
// is opaque on the wire and must survive a round trip untouched.
const EFFECTS_WITH_UNKNOWN_KEYS = {
  opacity: 0.5,
  speed: 1.5,
  transform: { scale: 1.2, x: 10 },
  someFutureEffect: { nested: [1, 2, 3], flag: true },
} as const;

const POOL: LibraryPoolSource[] = [
  {
    nodeId: SOURCE_ASSET_ID,
    kind: 'video',
    label: 'Hero cut',
    previewUrl: 'https://signed/hero.mp4',
    durationSec: 12.5,
  },
  { nodeId: OVERLAY_ASSET_ID, kind: 'image', label: 'Logo' },
];

const DOCUMENT: TimelineDocument = {
  items: [
    {
      id: 'item-1',
      order: 0,
      sourceNodeId: SOURCE_ASSET_ID,
      kind: 'video',
      trimStartSec: 1.25,
      trimEndSec: 9,
      muteAudio: false,
      volume: 0.8,
      audioFadeInSec: 0.3,
      audioFadeOutSec: 0.4,
      transition: { type: 'crossDissolve', durationSec: 0.5 },
      effects: EFFECTS_WITH_UNKNOWN_KEYS as unknown as TimelineDocument['items'][number]['effects'],
    },
    { id: 'item-2', order: 1, sourceNodeId: OVERLAY_ASSET_ID, kind: 'image', durationSec: 3 },
  ],
  overlayTracks: [
    {
      id: 'track-overlay-1',
      kind: 'overlay',
      items: [
        {
          id: 'overlay-1',
          order: 0,
          sourceNodeId: OVERLAY_ASSET_ID,
          kind: 'image',
          startSec: 2.5,
          durationSec: 4,
          effects:
            EFFECTS_WITH_UNKNOWN_KEYS as unknown as TimelineDocument['items'][number]['effects'],
        },
      ],
    },
  ],
  exportPresetId: 'reel-9x16',
  markers: [0, 3.5],
  captionsEnabled: true,
  captionWords: [{ text: 'hello', startSec: 0, endSec: 0.4 }],
  captionStyle: {
    textColor: '#ffffff',
    highlightColor: '#ffd400',
    outlineColor: '#000000',
    fontFamily: 'Inter',
  },
};

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: SOURCE_ASSET_ID,
    brandId: '33333333-3333-4333-8333-333333333333',
    kind: 'video',
    bucket: 'media-library',
    storagePath: 'brand/asset/hero.mp4',
    fileName: 'hero.mp4',
    mimeType: 'video/mp4',
    durationMs: 12_500,
    source: 'upload',
    status: 'ready',
    reviewStatus: 'none',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    signedUrl: 'https://signed/hero.mp4',
    title: 'Hero cut',
    ...overrides,
  } as MediaAsset;
}

describe('timelineDraftMapping', () => {
  it('produces a document the contract accepts', () => {
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: POOL,
      document: DOCUMENT,
    });
    expect(() => timelineDraftDocumentSchema.parse(draft)).not.toThrow();
    expect(draft.schemaVersion).toBe(TIMELINE_DRAFT_SCHEMA_VERSION);
    expect(draft.sourceAssetId).toBe(SOURCE_ASSET_ID);
  });

  it('renames sourceNodeId to sourceId on the wire, in both directions', () => {
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: POOL,
      document: DOCUMENT,
    });
    expect(draft.items[0].sourceId).toBe(SOURCE_ASSET_ID);
    expect(draft.items[0]).not.toHaveProperty('sourceNodeId');
    expect(draft.overlayTracks?.[0].items[0].sourceId).toBe(OVERLAY_ASSET_ID);

    const back = fromDraftDocument(draft);
    expect(back.items[0].sourceNodeId).toBe(SOURCE_ASSET_ID);
    expect(back.items[0]).not.toHaveProperty('sourceId');
    expect(back.overlayTracks?.[0].items[0].sourceNodeId).toBe(OVERLAY_ASSET_ID);
  });

  it('round-trips the whole document, including overlay tracks and captions', () => {
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: POOL,
      document: DOCUMENT,
    });
    expect(fromDraftDocument(draft)).toEqual({
      ...DOCUMENT,
      captionCues: [
        {
          id: 'caption-1',
          startSec: 0,
          endSec: 0.4,
          words: [{ text: 'hello', startSec: 0, endSec: 0.4 }],
        },
      ],
    });
  });

  it('round-trips opaque effects byte-for-byte, including keys it does not know', () => {
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: POOL,
      document: DOCUMENT,
    });
    // Survives JSON serialization to jsonb and back, which is the real trip.
    const parsed = timelineDraftDocumentSchema.parse(
      JSON.parse(JSON.stringify(draft)),
    ) as TimelineDraftDocument;
    const back = fromDraftDocument(parsed);
    expect(back.items[0].effects).toEqual(EFFECTS_WITH_UNKNOWN_KEYS as never);
    expect(back.overlayTracks?.[0].items[0].effects).toEqual(EFFECTS_WITH_UNKNOWN_KEYS as never);
  });

  it('persists the bin as durable coordinates only', () => {
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: POOL,
      document: DOCUMENT,
    });
    expect(draft.pool).toEqual([
      { assetId: SOURCE_ASSET_ID, kind: 'video', label: 'Hero cut', durationSec: 12.5 },
      { assetId: OVERLAY_ASSET_ID, kind: 'image', label: 'Logo' },
    ]);
    // A signed URL would be stale by the time anyone read it back.
    expect(JSON.stringify(draft.pool)).not.toContain('https://');
  });

  it('rehydrates the bin from freshly signed pool media', () => {
    const sources = draftPoolToSources(
      [
        { assetId: SOURCE_ASSET_ID, kind: 'video', label: 'Hero cut' },
        { assetId: OVERLAY_ASSET_ID, kind: 'image', label: 'Logo' },
      ],
      [
        {
          assetId: SOURCE_ASSET_ID,
          signedUrl: 'https://fresh/hero.mp4',
          kind: 'video',
          durationMs: 8000,
          label: 'Hero cut',
        },
        { assetId: OVERLAY_ASSET_ID, signedUrl: null, kind: null, durationMs: null, label: null },
      ],
    );

    expect(sources[0]).toEqual({
      nodeId: SOURCE_ASSET_ID,
      sourceAssetId: SOURCE_ASSET_ID,
      kind: 'video',
      label: 'Hero cut',
      previewUrl: 'https://fresh/hero.mp4',
      durationSec: 8,
    });
    // A deleted asset stays in the bin without a URL — a missing tile is visible,
    // a silently dropped clip is not.
    expect(sources[1]).toEqual({
      nodeId: OVERLAY_ASSET_ID,
      sourceAssetId: OVERLAY_ASSET_ID,
      kind: 'image',
      label: 'Logo',
    });
  });
});

describe('seedTimelineDocumentFromAsset', () => {
  it('seeds the asset itself as the bin and one full-length placement', () => {
    const seed = seedTimelineDocumentFromAsset(asset());

    expect(seed.pool).toEqual([
      {
        nodeId: SOURCE_ASSET_ID,
        kind: 'video',
        label: 'Hero cut',
        previewUrl: 'https://signed/hero.mp4',
        durationSec: 12.5,
      },
    ]);
    expect(seed.document.items).toHaveLength(1);
    expect(seed.document.items[0]).toMatchObject({
      order: 0,
      sourceNodeId: SOURCE_ASSET_ID,
      kind: 'video',
    });
    // Full length: no trim is applied, so the render uses the whole source.
    expect(seed.document.items[0].trimStartSec).toBeUndefined();
    expect(seed.document.items[0].trimEndSec).toBeUndefined();
    expect(seed.document.overlayTracks).toBeUndefined();
  });

  it('falls back to the file name and omits absent duration/preview', () => {
    const seed = seedTimelineDocumentFromAsset(
      asset({ title: null, durationMs: null, signedUrl: null }),
    );
    expect(seed.pool[0]).toEqual({ nodeId: SOURCE_ASSET_ID, kind: 'video', label: 'hero.mp4' });
  });

  it('starts an Opus clean clip with its editable caption draft', () => {
    const seed = seedTimelineDocumentFromAsset(
      asset({
        originRef: {
          captionWorkflow: 'clean-editable',
          captionCues: [
            {
              id: 'caption-1',
              startSec: 0,
              endSec: 0.6,
              words: [{ text: 'A better hook', startSec: 0, endSec: 0.6 }],
            },
          ],
          captionStyle: { textColor: '#ffffff', highlightColor: '#ffd400' },
        },
      }),
    );

    expect(seed.document).toMatchObject({
      captionsEnabled: true,
      captionCues: [
        {
          id: 'caption-1',
          words: [{ text: 'A better hook' }],
        },
      ],
      captionStyle: { textColor: '#ffffff', highlightColor: '#ffd400' },
    });
  });

  it('seeds a document the contract accepts once persisted', () => {
    const seed = seedTimelineDocumentFromAsset(asset());
    const draft = toDraftDocument({
      sourceAssetId: SOURCE_ASSET_ID,
      pool: seed.pool,
      document: seed.document,
    });
    expect(() => timelineDraftDocumentSchema.parse(draft)).not.toThrow();
  });
});
