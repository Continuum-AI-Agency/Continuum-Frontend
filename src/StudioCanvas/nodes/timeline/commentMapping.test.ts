import { describe, expect, test } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import type { TimelineItem } from '../../types';
import {
  buildClipPlacements,
  type ClipPlacement,
  editorRangeToSource,
  editorTimeToSource,
  projectCommentsToTimeline,
} from './commentMapping';

function placement(overrides: Partial<ClipPlacement> = {}): ClipPlacement {
  return {
    itemId: 'item-1',
    assetId: 'asset-1',
    trimStartSec: 0,
    trimEndSec: 10,
    speed: 1,
    outputStartSec: 0,
    track: 'base',
    ...overrides,
  };
}

function timeComment(
  id: string,
  timeMs: number,
  endMs?: number,
  assetId = 'asset-1',
): MediaComment {
  return {
    id,
    brandId: 'brand-1',
    assetId,
    versionId: null,
    parentCommentId: null,
    body: 'note',
    annotation: endMs === undefined ? { kind: 'time', timeMs } : { kind: 'time', timeMs, endMs },
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: null,
    authorEmail: null,
    createdAt: '2026-07-10T10:00:00Z',
    updatedAt: '2026-07-10T10:00:00Z',
  };
}

function plainComment(id: string, annotation: MediaComment['annotation']): MediaComment {
  return { ...timeComment(id, 0), annotation };
}

describe('projectCommentsToTimeline — point comments', () => {
  test('a point inside the kept window lands at its offset from the trim start', () => {
    // Source 4s sits 2s into the kept window [2,8], and the clip starts at 5s out.
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 4000)],
      [placement({ trimStartSec: 2, trimEndSec: 8, outputStartSec: 5 })],
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.outputStartSec).toBeCloseTo(7);
    expect(markers[0]?.outputEndSec).toBeNull();
    expect(markers[0]?.clipped).toBe(false);
    expect(markers[0]?.key).toBe('c1:item-1');
  });

  test('a point exactly on a cut shows on both adjacent clips of the same source', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 5000)],
      [
        placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 5, outputStartSec: 0 }),
        placement({ itemId: 'b', trimStartSec: 5, trimEndSec: 10, outputStartSec: 5 }),
      ],
    );
    expect(markers.map((m) => m.itemId)).toEqual(['a', 'b']);
    expect(markers[0]?.outputStartSec).toBeCloseTo(5);
    expect(markers[1]?.outputStartSec).toBeCloseTo(5);
  });

  test('a point outside every kept trim yields no marker at all', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 9000)],
      [
        placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 3, outputStartSec: 0 }),
        placement({ itemId: 'b', trimStartSec: 4, trimEndSec: 6, outputStartSec: 3 }),
      ],
    );
    expect(markers).toEqual([]);
  });

  test('speed compresses the offset into output time', () => {
    // 2x: 6s of source past the trim start occupies 3s of output.
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 6000)],
      [placement({ speed: 2, outputStartSec: 1 })],
    );
    expect(markers[0]?.outputStartSec).toBeCloseTo(4);
  });

  test('comments on other assets, box pins, and un-annotated comments are ignored', () => {
    const markers = projectCommentsToTimeline(
      [
        timeComment('other-asset', 1000, undefined, 'asset-2'),
        plainComment('box', { kind: 'box', x: 0.1, y: 0.1, width: 0.2, height: 0.2 }),
        plainComment('plain', null),
      ],
      [placement()],
    );
    expect(markers).toEqual([]);
  });
});

describe('projectCommentsToTimeline — range comments', () => {
  test('a range inside the kept window keeps both edges and is not clipped', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 3000, 6000)],
      [placement({ trimStartSec: 2, trimEndSec: 8, outputStartSec: 10 })],
    );
    expect(markers[0]?.outputStartSec).toBeCloseTo(11);
    expect(markers[0]?.outputEndSec).toBeCloseTo(14);
    expect(markers[0]?.clipped).toBe(false);
  });

  test('a range that overhangs the trim is clipped to the clip and flagged', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 1000, 9000)],
      [placement({ trimStartSec: 4, trimEndSec: 6, outputStartSec: 0 })],
    );
    expect(markers[0]?.outputStartSec).toBeCloseTo(0);
    expect(markers[0]?.outputEndSec).toBeCloseTo(2);
    expect(markers[0]?.clipped).toBe(true);
  });

  test('a range covering only the clip head is clipped at the tail', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 0, 4000)],
      [placement({ trimStartSec: 2, trimEndSec: 8, outputStartSec: 0 })],
    );
    expect(markers[0]?.outputStartSec).toBeCloseTo(0);
    expect(markers[0]?.outputEndSec).toBeCloseTo(2);
    expect(markers[0]?.clipped).toBe(true);
  });

  test('a range with no intersection with the trim produces no marker', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 1000, 2000)],
      [placement({ trimStartSec: 4, trimEndSec: 8 })],
    );
    expect(markers).toEqual([]);
  });

  test('a range with speed compresses the span', () => {
    // 4s of source ([2,6]) at 2x is 2s of output.
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 2000, 6000)],
      [placement({ speed: 2 })],
    );
    expect(markers[0]?.outputStartSec).toBeCloseTo(1);
    expect(markers[0]?.outputEndSec).toBeCloseTo(3);
  });
});

describe('projectCommentsToTimeline — placement topology', () => {
  test('the same asset placed twice yields two markers with distinct keys', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 3000)],
      [
        placement({ itemId: 'first', trimStartSec: 0, trimEndSec: 10, outputStartSec: 0 }),
        placement({ itemId: 'second', trimStartSec: 0, trimEndSec: 10, outputStartSec: 10 }),
      ],
    );
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.key)).toEqual(['c1:first', 'c1:second']);
    expect(markers.map((m) => m.outputStartSec)).toEqual([3, 13]);
  });

  test('overlay placements project with the same math and carry their track', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 2000, 4000)],
      [placement({ itemId: 'ov', track: 'overlay', outputStartSec: 20 })],
    );
    expect(markers[0]?.track).toBe('overlay');
    expect(markers[0]?.outputStartSec).toBeCloseTo(22);
    expect(markers[0]?.outputEndSec).toBeCloseTo(24);
  });

  test('image placements (no kept source window) never take a time comment', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('c1', 0)],
      [placement({ itemId: 'still', trimStartSec: 0, trimEndSec: 0 })],
    );
    expect(markers).toEqual([]);
  });

  test('markers come back ordered by output position', () => {
    const markers = projectCommentsToTimeline(
      [timeComment('late', 8000), timeComment('early', 1000)],
      [placement()],
    );
    expect(markers.map((m) => m.commentId)).toEqual(['early', 'late']);
  });
});

describe('editorTimeToSource', () => {
  const cutAtFive = [
    placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 5, outputStartSec: 0 }),
    placement({ itemId: 'b', trimStartSec: 20, trimEndSec: 25, outputStartSec: 5 }),
  ];

  test('resolves the playhead to the source frame under it', () => {
    expect(editorTimeToSource(2, cutAtFive)).toEqual({
      assetId: 'asset-1',
      itemId: 'a',
      sourceTimeMs: 2000,
    });
    expect(editorTimeToSource(7, cutAtFive)).toEqual({
      assetId: 'asset-1',
      itemId: 'b',
      sourceTimeMs: 22_000,
    });
  });

  test('speed expands output seconds back into source seconds', () => {
    const anchor = editorTimeToSource(2, [placement({ speed: 2, trimStartSec: 1, trimEndSec: 9 })]);
    expect(anchor?.sourceTimeMs).toBe(5000);
  });

  test('inside a cross-dissolve overlap the incoming clip wins', () => {
    // b cross-dissolves in 2s early, so [3,5] is covered by both clips.
    const overlapping = [
      placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 5, outputStartSec: 0 }),
      placement({ itemId: 'b', trimStartSec: 20, trimEndSec: 25, outputStartSec: 3 }),
    ];
    expect(editorTimeToSource(4, overlapping)?.itemId).toBe('b');
  });

  test('a playhead over a gap or a still resolves to nothing', () => {
    const gapped = [
      placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 2, outputStartSec: 0 }),
      placement({ itemId: 'still', trimStartSec: 0, trimEndSec: 0, outputStartSec: 2 }),
      placement({ itemId: 'b', trimStartSec: 0, trimEndSec: 2, outputStartSec: 5 }),
    ];
    expect(editorTimeToSource(3.5, gapped)).toBeNull();
    expect(editorTimeToSource(99, gapped)).toBeNull();
  });

  test('overlay placements are not addressable by the playhead', () => {
    expect(editorTimeToSource(1, [placement({ track: 'overlay' })])).toBeNull();
  });
});

describe('editorRangeToSource', () => {
  const cutAtFive = [
    placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 5, outputStartSec: 0 }),
    placement({ itemId: 'b', trimStartSec: 20, trimEndSec: 25, outputStartSec: 5 }),
  ];

  test('a sweep inside one clip resolves to a source range', () => {
    expect(editorRangeToSource(1, 3, cutAtFive)).toEqual({
      assetId: 'asset-1',
      itemId: 'a',
      timeMs: 1000,
      endMs: 3000,
    });
  });

  test('a backwards sweep is normalized', () => {
    expect(editorRangeToSource(3, 1, cutAtFive)?.timeMs).toBe(1000);
    expect(editorRangeToSource(3, 1, cutAtFive)?.endMs).toBe(3000);
  });

  test('a sweep across a cut cannot be one comment', () => {
    expect(editorRangeToSource(4, 6, cutAtFive)).toBeNull();
  });

  test('a sweep that starts or ends over a gap resolves to nothing', () => {
    const gapped = [placement({ itemId: 'a', trimStartSec: 0, trimEndSec: 2, outputStartSec: 0 })];
    expect(editorRangeToSource(1, 9, gapped)).toBeNull();
  });

  test('a sub-millisecond sweep is a point, not a range', () => {
    expect(editorRangeToSource(2, 2.0001, cutAtFive)).toBeNull();
  });

  test('the source range respects speed', () => {
    // 2 output seconds at 0.5x speed is 1 source second.
    const slow = [placement({ speed: 0.5, trimStartSec: 0, trimEndSec: 10 })];
    expect(editorRangeToSource(2, 4, slow)).toEqual({
      assetId: 'asset-1',
      itemId: 'item-1',
      timeMs: 1000,
      endMs: 2000,
    });
  });
});

describe('forward/inverse round trip', () => {
  for (const speed of [1, 2, 0.5]) {
    test(`a point comment recovers its source time at ${speed}x`, () => {
      const placements = [placement({ trimStartSec: 3, trimEndSec: 13, speed, outputStartSec: 4 })];
      const timeMs = 7250;
      const markers = projectCommentsToTimeline([timeComment('c1', timeMs)], placements);
      expect(markers).toHaveLength(1);
      const back = editorTimeToSource(markers[0]?.outputStartSec ?? 0, placements);
      expect(back?.itemId).toBe('item-1');
      expect(Math.abs((back?.sourceTimeMs ?? 0) - timeMs)).toBeLessThanOrEqual(1);
    });

    test(`a range comment recovers both edges at ${speed}x`, () => {
      const placements = [placement({ trimStartSec: 3, trimEndSec: 13, speed, outputStartSec: 4 })];
      const timeMs = 5500;
      const endMs = 9750;
      const markers = projectCommentsToTimeline([timeComment('c1', timeMs, endMs)], placements);
      const marker = markers[0];
      expect(marker?.outputEndSec).not.toBeNull();
      const back = editorRangeToSource(
        marker?.outputStartSec ?? 0,
        marker?.outputEndSec ?? 0,
        placements,
      );
      expect(Math.abs((back?.timeMs ?? 0) - timeMs)).toBeLessThanOrEqual(1);
      expect(Math.abs((back?.endMs ?? 0) - endMs)).toBeLessThanOrEqual(1);
    });
  }
});

describe('buildClipPlacements', () => {
  const videoItem = (over: Partial<TimelineItem> = {}): TimelineItem =>
    ({ id: 'item-1', order: 0, sourceNodeId: 'asset-1', kind: 'video', ...over }) as TimelineItem;

  test('recovers the source window from the output duration when no trim end is set', () => {
    const item = videoItem({ trimStartSec: 2 });
    const placements = buildClipPlacements({
      layoutClips: [{ item, startSec: 5, durationSec: 6 }],
    });
    expect(placements).toEqual([
      {
        itemId: 'item-1',
        assetId: 'asset-1',
        trimStartSec: 2,
        trimEndSec: 8,
        speed: 1,
        outputStartSec: 5,
        track: 'base',
      },
    ]);
  });

  test('a 2x clip spans twice as much source as it occupies output', () => {
    const item = videoItem({ trimStartSec: 0, effects: { speed: 2 } as TimelineItem['effects'] });
    const [placement] = buildClipPlacements({
      layoutClips: [{ item, startSec: 0, durationSec: 5 }],
    });
    expect(placement?.speed).toBe(2);
    expect(placement?.trimEndSec).toBe(10);
  });

  test('an explicit trim end wins over the derived one', () => {
    const item = videoItem({ trimStartSec: 1, trimEndSec: 4 });
    const [placement] = buildClipPlacements({
      layoutClips: [{ item, startSec: 0, durationSec: 3 }],
    });
    expect(placement?.trimEndSec).toBe(4);
  });

  test('stills are dropped — a time comment can never land on one', () => {
    const item = videoItem({ kind: 'image', durationSec: 3 });
    expect(buildClipPlacements({ layoutClips: [{ item, startSec: 0, durationSec: 3 }] })).toEqual(
      [],
    );
  });

  test('overlay items are placed at their own absolute start', () => {
    const overlayItem = videoItem({
      id: 'ov-1',
      sourceNodeId: 'asset-2',
      startSec: 12,
      trimStartSec: 0,
      trimEndSec: 4,
    });
    const placements = buildClipPlacements({
      layoutClips: [],
      overlayTracks: [{ id: 'track-1', kind: 'overlay', items: [overlayItem] }],
    });
    expect(placements).toEqual([
      {
        itemId: 'ov-1',
        assetId: 'asset-2',
        trimStartSec: 0,
        trimEndSec: 4,
        speed: 1,
        outputStartSec: 12,
        track: 'overlay',
      },
    ]);
  });

  test('the same asset placed twice yields two placements', () => {
    const placements = buildClipPlacements({
      layoutClips: [
        {
          item: videoItem({ id: 'a', trimStartSec: 0, trimEndSec: 3 }),
          startSec: 0,
          durationSec: 3,
        },
        {
          item: videoItem({ id: 'b', trimStartSec: 5, trimEndSec: 9 }),
          startSec: 3,
          durationSec: 4,
        },
      ],
    });
    expect(placements.map((p) => p.itemId)).toEqual(['a', 'b']);
    expect(new Set(placements.map((p) => p.assetId)).size).toBe(1);
  });
});
