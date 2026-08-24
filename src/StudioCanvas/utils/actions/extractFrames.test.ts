import { describe, expect, it } from 'bun:test';
import {
  computeFrameGridLayout,
  meanAbsDiff,
  pickSceneChanges,
  planFrameTimes,
} from './extractFrames';

// COVERAGE GAP, on purpose: `extractFrames`, `extractSceneChangeFrames` and
// `buildFrameGrid` are NOT tested here. The test environment is bun + happy-dom, which
// implements neither WebCodecs nor OffscreenCanvas, so a test of the decode or the draw
// would only assert that the stub throws. The parts that actually get a frame count, a
// cut, or a tile position wrong — the sampling plan, the diff, the cut picker and the
// grid geometry — are pure and are tested exhaustively below. The decode path is
// covered by clicking the node, not by this file.

const rgba = (...quads: number[][]): Uint8ClampedArray => Uint8ClampedArray.from(quads.flat());

describe('planFrameTimes — single', () => {
  it('defaults to the midpoint of the clip', () => {
    expect(planFrameTimes(10, { mode: 'single' })).toEqual([5]);
  });

  it('honours an explicit timestamp', () => {
    expect(planFrameTimes(10, { mode: 'single', atSec: 2.5 })).toEqual([2.5]);
  });

  it('clamps a timestamp outside the clip back inside it', () => {
    expect(planFrameTimes(10, { mode: 'single', atSec: 99 })).toEqual([9.999]);
    expect(planFrameTimes(10, { mode: 'single', atSec: -4 })).toEqual([0]);
  });
});

describe('planFrameTimes — evenly', () => {
  it('samples bucket midpoints, so never at 0 and never at the duration', () => {
    expect(planFrameTimes(8, { mode: 'evenly', count: 4 })).toEqual([1, 3, 5, 7]);
  });

  it('puts a single evenly-spaced frame at the midpoint', () => {
    expect(planFrameTimes(8, { mode: 'evenly', count: 1 })).toEqual([4]);
  });

  it('never opens on 0 or ends on the duration, at any count', () => {
    for (const count of [1, 2, 3, 6, 12, 60]) {
      const times = planFrameTimes(9.6, { mode: 'evenly', count });
      expect(times).toHaveLength(count);
      expect(times[0]).toBeGreaterThan(0);
      expect(times.at(-1)).toBeLessThan(9.6);
    }
  });

  it('clamps a nonsense count instead of returning nothing', () => {
    expect(planFrameTimes(8, { mode: 'evenly', count: 0 })).toEqual([4]);
    expect(planFrameTimes(8, { mode: 'evenly', count: -3 })).toEqual([4]);
    expect(planFrameTimes(8, { mode: 'evenly', count: Number.NaN })).toEqual([4]);
    expect(planFrameTimes(8, { mode: 'evenly' })).toEqual([4]);
  });

  it('caps an absurd count at the sample ceiling', () => {
    expect(planFrameTimes(600, { mode: 'evenly', count: 5000 })).toHaveLength(240);
  });

  it('collapses to one frame when the buckets are finer than the clamp window', () => {
    expect(planFrameTimes(0.001, { mode: 'evenly', count: 60 })).toEqual([0]);
  });
});

describe('planFrameTimes — interval', () => {
  it('yields ceil(duration / interval) frames starting at 0', () => {
    // The PRD's headline case: a 3.0s clip on a 1s interval is 3 frames, not 4.
    expect(planFrameTimes(3.0, { mode: 'interval', intervalSec: 1 })).toEqual([0, 1, 2]);
    expect(planFrameTimes(3.5, { mode: 'interval', intervalSec: 1 })).toEqual([0, 1, 2, 3]);
  });

  it('matches Math.ceil(duration / interval) across the PRD 1s, 2s and 3s cases', () => {
    for (const durationSec of [1, 3, 3.5, 7, 10, 12.4, 30]) {
      for (const intervalSec of [1, 2, 3]) {
        expect(planFrameTimes(durationSec, { mode: 'interval', intervalSec })).toHaveLength(
          Math.ceil(durationSec / intervalSec),
        );
      }
    }
  });

  it('never samples at or past the duration', () => {
    const times = planFrameTimes(9, { mode: 'interval', intervalSec: 3 });
    expect(times).toEqual([0, 3, 6]);
  });

  it('falls back to the opening frame on a non-positive or missing interval', () => {
    expect(planFrameTimes(10, { mode: 'interval', intervalSec: 0 })).toEqual([0]);
    expect(planFrameTimes(10, { mode: 'interval', intervalSec: -1 })).toEqual([0]);
    expect(planFrameTimes(10, { mode: 'interval', intervalSec: Number.NaN })).toEqual([0]);
    expect(planFrameTimes(10, { mode: 'interval' })).toEqual([0]);
  });

  it('yields the opening frame when the interval outruns the clip', () => {
    expect(planFrameTimes(2, { mode: 'interval', intervalSec: 30 })).toEqual([0]);
  });

  it('caps a dense interval at the sample ceiling', () => {
    expect(planFrameTimes(600, { mode: 'interval', intervalSec: 0.1 })).toHaveLength(240);
  });
});

describe('planFrameTimes — sceneChange', () => {
  it('returns the dense probe grid, four samples a second', () => {
    const times = planFrameTimes(2, { mode: 'sceneChange' });
    expect(times).toHaveLength(8);
  });

  it('caps the probe grid on a long clip', () => {
    expect(planFrameTimes(100, { mode: 'sceneChange' })).toHaveLength(240);
    expect(planFrameTimes(3600, { mode: 'sceneChange' })).toHaveLength(240);
  });

  it('probes at least twice, so there is always a pair to diff', () => {
    expect(planFrameTimes(0.2, { mode: 'sceneChange' })).toHaveLength(2);
  });

  it('stays inside the clip and ascends', () => {
    const times = planFrameTimes(12, { mode: 'sceneChange' });
    expect(times[0]).toBeGreaterThan(0);
    expect(times.at(-1)).toBeLessThan(12);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('planFrameTimes — degenerate durations', () => {
  it('returns the opening frame for a clip with no measurable length', () => {
    for (const mode of ['single', 'evenly', 'interval', 'sceneChange'] as const) {
      expect(planFrameTimes(0, { mode, count: 6, intervalSec: 1 })).toEqual([0]);
      expect(planFrameTimes(-5, { mode, count: 6, intervalSec: 1 })).toEqual([0]);
      expect(planFrameTimes(Number.NaN, { mode, count: 6, intervalSec: 1 })).toEqual([0]);
      expect(planFrameTimes(Number.POSITIVE_INFINITY, { mode, count: 6, intervalSec: 1 })).toEqual([
        0,
      ]);
    }
  });

  it('is always ascending, deduped and non-empty', () => {
    for (const mode of ['single', 'evenly', 'interval', 'sceneChange'] as const) {
      const times = planFrameTimes(5, { mode, count: 8, intervalSec: 0.5 });
      expect(times.length).toBeGreaterThan(0);
      expect(new Set(times).size).toBe(times.length);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });
});

describe('meanAbsDiff', () => {
  it('is 0 for identical buffers', () => {
    const frame = rgba([12, 240, 3, 255], [99, 1, 200, 255]);
    expect(meanAbsDiff(frame, frame)).toBe(0);
    expect(meanAbsDiff(frame, Uint8ClampedArray.from(frame))).toBe(0);
  });

  it('is 1 for black against white', () => {
    const black = new Uint8ClampedArray(64).fill(0);
    const white = new Uint8ClampedArray(64).fill(255);
    expect(meanAbsDiff(black, white)).toBe(1);
  });

  it('is 1 for OPAQUE black against opaque white — alpha does not dilute the score', () => {
    const black = rgba([0, 0, 0, 255], [0, 0, 0, 255]);
    const white = rgba([255, 255, 255, 255], [255, 255, 255, 255]);
    expect(meanAbsDiff(black, white)).toBe(1);
  });

  it('ignores a difference that lives only in the alpha channel', () => {
    expect(meanAbsDiff(rgba([10, 20, 30, 0]), rgba([10, 20, 30, 255]))).toBe(0);
  });

  it('scales linearly with the channel difference', () => {
    expect(meanAbsDiff(rgba([0, 0, 0, 255]), rgba([128, 128, 128, 255]))).toBeCloseTo(
      128 / 255,
      10,
    );
    expect(
      meanAbsDiff(rgba([0, 0, 0, 255], [50, 50, 50, 255]), rgba([0, 0, 0, 255], [50, 50, 50, 255])),
    ).toBe(0);
  });

  it('averages across the whole buffer, not just the changed pixel', () => {
    // One of two pixels goes black→white: three channels at full swing out of six.
    const before = rgba([0, 0, 0, 255], [0, 0, 0, 255]);
    const after = rgba([255, 255, 255, 255], [0, 0, 0, 255]);
    expect(meanAbsDiff(before, after)).toBeCloseTo(0.5, 10);
  });

  it('accepts a Uint8Array against a Uint8ClampedArray', () => {
    expect(meanAbsDiff(Uint8Array.from([0, 0, 0, 255]), rgba([255, 255, 255, 255]))).toBe(1);
  });

  it('throws on mismatched lengths rather than inventing a score', () => {
    expect(() => meanAbsDiff(rgba([0, 0, 0, 255]), rgba([0, 0, 0, 255], [1, 1, 1, 255]))).toThrow(
      /different sizes/,
    );
  });

  it('is 0 for empty buffers instead of NaN', () => {
    expect(meanAbsDiff(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('pickSceneChanges', () => {
  it('always includes the opening frame', () => {
    expect(pickSceneChanges([], 0.12)).toEqual([0]);
    expect(pickSceneChanges([0], 0.12)).toEqual([0]);
  });

  it('returns only the opening frame when nothing crosses the threshold', () => {
    expect(pickSceneChanges([0, 0.01, 0.05, 0.11], 0.12)).toEqual([0]);
  });

  it('picks every frame at or above the threshold', () => {
    expect(pickSceneChanges([0, 0.02, 0.6, 0.03, 0.12, 0.9], 0.12)).toEqual([0, 2, 4, 5]);
  });

  it('ignores the first diff, which has no previous frame to compare against', () => {
    expect(pickSceneChanges([0.99, 0.01], 0.12)).toEqual([0]);
  });

  it('keeps everything at a threshold of 0', () => {
    expect(pickSceneChanges([0, 0, 0, 0], 0)).toEqual([0, 1, 2, 3]);
  });

  it('keeps only the opening frame at an unreachable threshold', () => {
    expect(pickSceneChanges([0, 0.5, 0.9], 1.5)).toEqual([0]);
  });
});

describe('computeFrameGridLayout', () => {
  const base = { columns: 3, rows: 3, cellWidth: 100, cellAspect: 1, gap: 10 };

  it('sizes the sheet with an outer gutter on every edge', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 9 });
    expect(layout.width).toBe(3 * 100 + 4 * 10);
    expect(layout.height).toBe(3 * 100 + 4 * 10);
  });

  it('drops the gutter entirely at gap 0', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 9, gap: 0 });
    expect(layout.width).toBe(300);
    expect(layout.height).toBe(300);
    expect(layout.cells[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(layout.cells[4]).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });

  it('lays the cells out in row-major order', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 6 });
    expect(layout.cells.map((cell) => [cell.x, cell.y])).toEqual([
      [10, 10],
      [120, 10],
      [230, 10],
      [10, 120],
      [120, 120],
      [230, 120],
    ]);
  });

  it('derives the cell height from the aspect ratio', () => {
    const layout = computeFrameGridLayout({
      ...base,
      cellCount: 1,
      cellWidth: 320,
      cellAspect: 16 / 9,
    });
    expect(layout.cells[0]?.height).toBe(180);
    expect(layout.height).toBe(3 * 180 + 4 * 10);
  });

  it('emits exactly cellCount cells when the grid has room to spare', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 4 });
    expect(layout.cells).toHaveLength(4);
    expect(layout.dropped).toBe(0);
    // The canvas still spans the full 3x3 the caller asked for.
    expect(layout.height).toBe(3 * 100 + 4 * 10);
  });

  it('truncates to the grid capacity and REPORTS what it dropped', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 14 });
    expect(layout.cells).toHaveLength(9);
    expect(layout.dropped).toBe(5);
  });

  it('handles an empty sheet', () => {
    const layout = computeFrameGridLayout({ ...base, cellCount: 0 });
    expect(layout.cells).toHaveLength(0);
    expect(layout.dropped).toBe(0);
    expect(layout.width).toBe(340);
  });

  it('sanitises nonsense geometry instead of producing an unusable canvas', () => {
    const layout = computeFrameGridLayout({
      cellCount: 2,
      columns: 0,
      rows: -4,
      cellWidth: Number.NaN,
      cellAspect: 0,
      gap: -20,
    });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.cells).toHaveLength(1);
    expect(layout.dropped).toBe(1);
  });

  it('never returns a fractional dimension — a canvas cannot have one', () => {
    const layout = computeFrameGridLayout({
      cellCount: 5,
      columns: 3,
      rows: 2,
      cellWidth: 333,
      cellAspect: 7 / 3,
      gap: 4.4,
    });
    expect(Number.isInteger(layout.width)).toBe(true);
    expect(Number.isInteger(layout.height)).toBe(true);
    for (const cell of layout.cells) {
      expect(Number.isInteger(cell.x)).toBe(true);
      expect(Number.isInteger(cell.y)).toBe(true);
      expect(Number.isInteger(cell.height)).toBe(true);
    }
  });
});
