import { describe, expect, it } from 'bun:test';
import { boundaryTimes, laneItemEdges, snapSec } from './snapping';
import type { TimelineLayout } from './useTimelineEditorModel';

const layout: TimelineLayout = {
  totalSec: 9,
  clips: [
    {
      item: { id: 'a', order: 0, sourceNodeId: 'a', kind: 'video' },
      startSec: 0,
      durationSec: 4,
      leftPx: 0,
      widthPx: 0,
    },
    {
      item: { id: 'b', order: 1, sourceNodeId: 'b', kind: 'video' },
      startSec: 4,
      durationSec: 5,
      leftPx: 0,
      widthPx: 0,
    },
  ],
};

describe('boundaryTimes', () => {
  it('collects unique clip edges plus timeline start/end', () => {
    expect(boundaryTimes(layout).sort((a, b) => a - b)).toEqual([0, 4, 9]);
  });
});

describe('snapSec', () => {
  it('snaps to the nearest boundary within the pixel threshold', () => {
    // 80 px/sec, 8px threshold => 0.1s window. 4.05s is within 0.1s of the 4s cut.
    expect(snapSec(4.05, boundaryTimes(layout), 80)).toBe(4);
  });

  it('leaves the value untouched when no boundary is close enough', () => {
    expect(snapSec(2, boundaryTimes(layout), 80)).toBe(2);
  });

  it('widens the snap window at lower zoom', () => {
    // 20 px/sec, 8px threshold => 0.4s window. 4.3s now snaps to 4s.
    expect(snapSec(4.3, boundaryTimes(layout), 20)).toBe(4);
    expect(snapSec(4.3, boundaryTimes(layout), 80)).toBe(4.3);
  });
});

describe('laneItemEdges', () => {
  it('returns the start and end of every lane item (cross-track snap targets)', () => {
    expect(
      laneItemEdges([
        { startSec: 1, durationSec: 2 },
        { startSec: 5, durationSec: 1.5 },
      ]),
    ).toEqual([1, 3, 5, 6.5]);
  });

  it('is empty for no items', () => {
    expect(laneItemEdges([])).toEqual([]);
  });
});
