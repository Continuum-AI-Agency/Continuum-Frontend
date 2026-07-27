import { describe, expect, it } from 'bun:test';
import {
  applyTimelineEdits,
  type TimelineAuthoringDocument,
  timelineDocumentFingerprint,
  timelineEditBatchSchema,
} from './timeline-authoring';

const sourceDurations = new Map([
  ['clip-a', 12],
  ['clip-b', 8],
  ['music-a', 30],
]);

const baseDocument = (): TimelineAuthoringDocument => ({
  items: [
    {
      id: 'item-a',
      order: 0,
      sourceNodeId: 'clip-a',
      kind: 'video',
      trimStartSec: 0,
      trimEndSec: 10,
    },
  ],
});

describe('timeline authoring reducer', () => {
  it('applies a rich edit batch atomically and returns stable created ids', () => {
    const result = applyTimelineEdits(
      baseDocument(),
      [
        { op: 'trim_item', itemId: 'item-a', startSec: 1, endSec: 6 },
        {
          op: 'set_item_effects',
          itemId: 'item-a',
          effects: { filterPreset: 'vivid', speed: 1.25 },
        },
        { op: 'add_overlay_track', trackId: 'product' },
        {
          op: 'place_overlay',
          trackId: 'product',
          sourceNodeId: 'clip-b',
          kind: 'video',
          startSec: 2,
          clientRef: 'product-pip',
        },
        {
          op: 'set_export_preset',
          exportPresetId: 'vertical-1080',
        },
      ],
      {
        pooledSourceIds: new Set(['clip-a', 'clip-b']),
        sourceDurations,
        idFactory: (kind, index, source) => `${kind}:${index}:${source ?? 'new'}`,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.items[0]).toMatchObject({
      trimStartSec: 1,
      trimEndSec: 6,
      effects: { filterPreset: 'vivid', speed: 1.25 },
    });
    expect(result.document.overlayTracks?.[0].items[0]).toMatchObject({
      id: 'item:3:clip-b',
      sourceNodeId: 'clip-b',
      startSec: 2,
      muteAudio: true,
    });
    expect(result.created).toEqual({ 'product-pip': 'item:3:clip-b' });
    expect(result.invalidatesRender).toBe(true);
  });

  it('rejects the whole batch when a source is not connected', () => {
    const original = baseDocument();
    const result = applyTimelineEdits(
      original,
      [
        { op: 'set_markers', markers: [2] },
        { op: 'place_source', sourceNodeId: 'orphan', kind: 'video' },
      ],
      { pooledSourceIds: new Set(['clip-a']) },
    );

    expect(result.ok).toBe(false);
    expect(result.document).toEqual(original);
  });

  it('resolves a placed clientRef in later operations from the same batch', () => {
    const result = applyTimelineEdits(
      { items: [] },
      [
        {
          op: 'place_source',
          sourceNodeId: 'clip-b',
          kind: 'video',
          clientRef: 'hero',
        },
        { op: 'trim_item', itemId: 'hero', startSec: 1, endSec: 6 },
        { op: 'set_item_audio', itemId: 'hero', muteAudio: true },
      ],
      {
        pooledSourceIds: new Set(['clip-b']),
        sourceDurations,
        idFactory: () => 'item-hero',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toEqual({ hero: 'item-hero' });
    expect(result.document.items).toEqual([
      {
        id: 'item-hero',
        order: 0,
        sourceNodeId: 'clip-b',
        kind: 'video',
        trimStartSec: 1,
        trimEndSec: 6,
        muteAudio: true,
      },
    ]);
    expect(result.affectedItemIds).toEqual(['item-hero']);
  });

  it('keeps marker-only batches from invalidating a render', () => {
    const result = applyTimelineEdits(baseDocument(), [{ op: 'set_markers', markers: [4, 1, 4] }], {
      pooledSourceIds: new Set(['clip-a']),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invalidatesRender).toBe(false);
    expect(result.document.markers).toEqual([1, 4, 4]);
  });

  it('authors an absolute-time audio bed with trims, gain, fades, and stable refs', () => {
    const result = applyTimelineEdits(
      baseDocument(),
      [
        { op: 'add_audio_track', trackId: 'music-1' },
        {
          op: 'place_audio',
          trackId: 'music-1',
          sourceNodeId: 'music-a',
          startSec: 2.5,
          clientRef: 'bed',
        },
        { op: 'trim_audio', itemId: 'bed', startSec: 1, endSec: 12 },
        { op: 'move_audio', itemId: 'bed', startSec: 3 },
        { op: 'set_audio', itemId: 'bed', volume: 0.25, fadeInSec: 0.5, fadeOutSec: 1 },
      ],
      {
        pooledSourceIds: new Set(['clip-a', 'music-a']),
        sourceDurations,
        sourceKinds: new Map([
          ['clip-a', 'video'],
          ['music-a', 'audio'],
        ]),
        idFactory: () => 'audio-bed-1',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toEqual({ bed: 'audio-bed-1' });
    expect(result.document.audioTracks).toEqual([
      {
        id: 'music-1',
        kind: 'audio',
        items: [
          {
            id: 'audio-bed-1',
            order: 0,
            sourceNodeId: 'music-a',
            kind: 'audio',
            startSec: 3,
            trimStartSec: 1,
            trimEndSec: 12,
            volume: 0.25,
            audioFadeInSec: 0.5,
            audioFadeOutSec: 1,
          },
        ],
      },
    ]);
    expect(result.affectedItemIds).toEqual(['audio-bed-1']);
    expect(result.invalidatesRender).toBe(true);
  });

  it('rejects a visual source placed as audio and rolls the whole batch back', () => {
    const original = baseDocument();
    const result = applyTimelineEdits(
      original,
      [
        { op: 'add_audio_track', trackId: 'music-1' },
        {
          op: 'place_audio',
          trackId: 'music-1',
          sourceNodeId: 'clip-a',
          startSec: 0,
        },
      ],
      {
        pooledSourceIds: new Set(['clip-a']),
        sourceDurations,
        sourceKinds: new Map([['clip-a', 'video']]),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.document).toEqual(original);
  });

  it('splits output time through playback speed', () => {
    const document = baseDocument();
    document.items[0].effects = { speed: 2 };
    const result = applyTimelineEdits(
      document,
      [{ op: 'split_item', itemId: 'item-a', atOutputSec: 2, clientRef: 'tail' }],
      {
        pooledSourceIds: new Set(['clip-a']),
        sourceDurations,
        idFactory: () => 'item-tail',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.items).toHaveLength(2);
    expect(result.document.items[0].trimEndSec).toBe(4);
    expect(result.document.items[1]).toMatchObject({
      id: 'item-tail',
      trimStartSec: 4,
      trimEndSec: 10,
    });
  });

  it('fingerprints document content deterministically', () => {
    expect(timelineDocumentFingerprint(baseDocument())).toBe(
      timelineDocumentFingerprint(baseDocument()),
    );
    expect(
      timelineDocumentFingerprint({
        ...baseDocument(),
        exportPresetId: 'vertical-1080',
      }),
    ).not.toBe(timelineDocumentFingerprint(baseDocument()));
  });

  it('requires optimistic concurrency on edit batches', () => {
    expect(
      timelineEditBatchSchema.safeParse({
        nodeId: 'editor',
        operations: [{ op: 'set_markers', markers: [] }],
      }).success,
    ).toBe(false);
  });
});
