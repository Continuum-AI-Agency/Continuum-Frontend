import { describe, expect, it } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import { buildCommentThreads } from '@/lib/library/comments';
import { partitionThreadsByVersion } from './commentVersions';
import { buildStageAnnotations } from './stageAnnotations';

const V1 = 'version-1';
const V2 = 'version-2';

function comment(overrides: Partial<MediaComment> & { id: string }): MediaComment {
  return {
    brandId: 'brand-1',
    assetId: 'asset-1',
    versionId: null,
    parentCommentId: null,
    body: 'body',
    annotation: null,
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: 'Jane Doe',
    authorEmail: 'jane@example.com',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const BOX_ON_V1 = comment({
  id: 'c-box-v1',
  versionId: V1,
  annotation: { kind: 'box', x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
});
const TIME_ON_V1 = comment({
  id: 'c-time-v1',
  versionId: V1,
  annotation: { kind: 'time', timeMs: 1500 },
});
const BOX_ON_V2 = comment({
  id: 'c-box-v2',
  versionId: V2,
  annotation: { kind: 'box', x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
  createdAt: '2026-07-05T00:00:00.000Z',
});
const TIME_ON_V2 = comment({
  id: 'c-time-v2',
  versionId: V2,
  annotation: { kind: 'time', timeMs: 9000, endMs: 12000 },
  createdAt: '2026-07-06T00:00:00.000Z',
});

// The chain the modal runs: thread → partition by the viewed version → pins.
function pinsFor(comments: MediaComment[], viewedVersionId: string) {
  const partition = partitionThreadsByVersion({
    threads: buildCommentThreads(comments),
    viewedVersionId,
    headVersionId: V2,
  });
  return buildStageAnnotations({
    openThreads: partition.current.open,
    selectedCommentId: null,
  });
}

describe('buildStageAnnotations under version viewing', () => {
  it('draws no pin and no marker for a comment written on an older version', () => {
    const { imagePins, videoMarkers, pinLabels } = pinsFor(
      [BOX_ON_V1, TIME_ON_V1, BOX_ON_V2, TIME_ON_V2],
      V2,
    );

    // A v1 box addresses v1's crop and a v1 timeMs addresses v1's cut: neither
    // may be painted over the v2 bytes that are actually on the stage.
    expect(imagePins.map((p) => p.id)).toEqual(['c-box-v2']);
    expect(videoMarkers.map((m) => m.id)).toEqual(['c-time-v2']);
    expect(pinLabels.has('c-box-v1')).toBe(false);
    expect(pinLabels.has('c-time-v1')).toBe(false);
  });

  it('draws the older version’s own pins once its bytes are on the stage', () => {
    const { imagePins, videoMarkers } = pinsFor([BOX_ON_V1, TIME_ON_V1, BOX_ON_V2, TIME_ON_V2], V1);

    expect(imagePins.map((p) => p.id)).toEqual(['c-box-v1']);
    expect(imagePins[0]?.box).toEqual({ kind: 'box', x: 0.1, y: 0.1, width: 0.3, height: 0.3 });
    expect(videoMarkers.map((m) => m.id)).toEqual(['c-time-v1']);
    expect(videoMarkers.map((m) => m.timeMs)).toEqual([1500]);
    // The v2 notes are now the ones that address bytes nobody is looking at.
    expect(imagePins.some((p) => p.id === 'c-box-v2')).toBe(false);
    expect(videoMarkers.some((m) => m.id === 'c-time-v2')).toBe(false);
  });

  it('numbers box pins in creation order and labels time pins with their range', () => {
    const { imagePins, videoMarkers, pinLabels } = pinsFor([BOX_ON_V2, TIME_ON_V2], V2);

    expect(imagePins.map((p) => p.label)).toEqual(['1']);
    expect(pinLabels.get('c-time-v2')).toBe('0:09–0:12');
    expect(videoMarkers[0]?.endMs).toBe(12000);
    expect(videoMarkers[0]?.initials).toBe('JD');
  });

  it('retires the pin of a resolved thread even on the viewed version', () => {
    const resolved = comment({
      ...BOX_ON_V2,
      id: 'c-resolved-v2',
      resolvedAt: '2026-07-07T00:00:00.000Z',
    });
    const { imagePins } = pinsFor([BOX_ON_V2, resolved], V2);

    expect(imagePins.map((p) => p.id)).toEqual(['c-box-v2']);
  });

  it('marks the selected thread’s pin as selected', () => {
    const partition = partitionThreadsByVersion({
      threads: buildCommentThreads([BOX_ON_V2]),
      viewedVersionId: V2,
      headVersionId: V2,
    });
    const { imagePins } = buildStageAnnotations({
      openThreads: partition.current.open,
      selectedCommentId: 'c-box-v2',
    });

    expect(imagePins[0]?.selected).toBe(true);
  });
});
