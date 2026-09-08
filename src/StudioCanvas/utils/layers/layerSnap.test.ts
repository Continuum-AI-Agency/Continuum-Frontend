import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import { movingBounds, snapBounds, snapTargets } from './layerSnap';
import type { Rect } from './layerTransform';

const frame = { width: 1000, height: 1000 };

const layer = (id: string, over: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  // Anchor at the source centre, so `position` is the layer's own centre and the placed
  // bounds are position ± 50.
  anchor: { x: 50, y: 50 },
  position: { x: 500, y: 500 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...over,
});

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('snapTargets', () => {
  test('always offers the frame', () => {
    const targets = snapTargets({ layers: [], movingIds: [], frame });
    expect(targets).toEqual([rect(0, 0, 1000, 1000)]);
  });

  test('a layer never snaps to itself', () => {
    const dragged = layer('dragged');
    const targets = snapTargets({ layers: [dragged], movingIds: ['dragged'], frame });
    expect(targets).toHaveLength(1);
  });

  test('a hidden layer is not something to line up with', () => {
    const targets = snapTargets({
      layers: [layer('hidden', { visible: false }), layer('shown')],
      movingIds: [],
      frame,
    });
    expect(targets).toHaveLength(2);
  });
});

describe('snapBounds', () => {
  const targets = [rect(0, 0, 1000, 1000)];

  test('pulls a near-miss left edge onto the frame edge', () => {
    const result = snapBounds({ moved: rect(3, 400, 103, 500), targets, threshold: 8 });
    expect(result.dx).toBe(-3);
    expect(result.guides).toContainEqual({ axis: 'x', at: 0 });
  });

  test('leaves a clear miss alone', () => {
    // Deliberately clear of every frame edge AND both centre lines on both axes — the
    // first draft of this case put the bottom edge on y=500 and snapped by design.
    const result = snapBounds({ moved: rect(40, 40, 140, 140), targets, threshold: 8 });
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  test('snaps the CENTRE, not only the edges', () => {
    // Centre at 498 with the frame centre at 500: this is the alignment people actually
    // want and the one a numeric grid could never express.
    const result = snapBounds({ moved: rect(448, 100, 548, 200), targets, threshold: 8 });
    expect(result.dx).toBe(2);
    expect(result.guides).toContainEqual({ axis: 'x', at: 500 });
  });

  test('decides the two axes independently', () => {
    const result = snapBounds({ moved: rect(2, 995, 102, 1095), targets, threshold: 8 });
    expect(result.dx).toBe(-2);
    // The bottom edge is at 1095, but the TOP edge at 995 is 5 from the frame's bottom.
    expect(result.dy).toBe(5);
    expect(result.guides).toHaveLength(2);
  });

  test('snaps to another layer, not just the frame', () => {
    const other = layer('other', { position: { x: 200, y: 200 } });
    const all = snapTargets({ layers: [other], movingIds: ['dragged'], frame });
    // `other` occupies 150..250. A dragged layer whose left edge is at 153 should land on
    // 150 — lining up with the thing on screen.
    const result = snapBounds({ moved: rect(153, 600, 253, 700), targets: all, threshold: 8 });
    expect(result.dx).toBe(-3);
    expect(result.guides).toContainEqual({ axis: 'x', at: 150 });
  });

  test('a real layer wins a tie against the frame', () => {
    // A layer edge exactly on the frame's left edge: both are candidates at distance 3.
    const flush = layer('flush', { position: { x: 50, y: 800 } });
    const all = snapTargets({ layers: [flush], movingIds: ['dragged'], frame });
    const result = snapBounds({ moved: rect(3, 100, 103, 200), targets: all, threshold: 8 });
    expect(result.dx).toBe(-3);
  });

  test('a zero threshold disables it', () => {
    const result = snapBounds({ moved: rect(3, 400, 103, 500), targets, threshold: 0 });
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  test('FALSIFIER: it is the BOUNDS that snap, not the anchor', () => {
    // A 101-wide layer sitting at a half pixel. Snapping its ANCHOR to a 16px grid
    // leaves both edges on half-pixels forever, however long you nudge it; snapping its
    // BOUNDS lands an edge exactly on the target, which is the thing you can see.
    const odd = rect(2.5, 300, 103.5, 400);
    const result = snapBounds({ moved: odd, targets, threshold: 8 });
    expect(result.dx).toBe(-2.5);
    expect(odd.left + result.dx).toBe(0);
  });
});

describe('movingBounds', () => {
  test('is the union across a multi-selection', () => {
    const layers = [
      layer('a', { position: { x: 100, y: 100 } }),
      layer('b', { position: { x: 300, y: 400 } }),
    ];
    expect(movingBounds(layers, ['a', 'b'])).toEqual(rect(50, 50, 350, 450));
  });

  test('is null when nothing is selected', () => {
    expect(movingBounds([layer('a')], [])).toBeNull();
  });
});
