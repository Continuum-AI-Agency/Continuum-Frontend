import { describe, expect, test } from 'bun:test';
import type { TemplateEditableLayer } from '@continuum/contracts';
import {
  alignFrames,
  frameCanvasSelection,
  retainCanvasViewOnResize,
  type CanvasLayerFrame,
  canvasGestureAllowed,
  moveFrames,
  normalizeSelection,
  resizeFrames,
  rotateFrames,
  snapTranslation,
  toggleSelection,
  usableSnapRects,
  unionBounds,
} from './templateLayerCanvasGeometry';

const makeFrame = (
  layerId: number,
  position: [number, number],
  bounds: CanvasLayerFrame['bounds'],
  extra: Partial<TemplateEditableLayer> = {},
): CanvasLayerFrame => {
  const layer: TemplateEditableLayer = {
    compId: 1,
    comp: 'Main',
    layerId,
    name: `Layer ${layerId}`,
    kind: 'artwork',
    visible: true,
    visibilityReason: null,
    textReason: null,
    text: null,
    font: null,
    fontSize: null,
    slotKeys: [],
    visibilitySlotKeys: [],
    index: layerId - 1,
    position,
    rotation: 0,
    scale: [100, 100],
    opacity: 100,
    transformLocks: {},
    parentName: null,
    parentId: null,
    ...extra,
  };
  return {
    layer,
    position,
    rotation: layer.rotation ?? 0,
    scale: layer.scale ?? [100, 100],
    bounds,
  };
};

describe('canvas selection and geometry', () => {
  test('keeps selection unique, comp-local, and stable by numeric UID', () => {
    const first = makeFrame(11, [0, 0], { left: 0, top: 0, right: 10, bottom: 10 }).layer;
    const otherComp = {
      ...makeFrame(12, [0, 0], { left: 0, top: 0, right: 10, bottom: 10 }).layer,
      compId: 2,
    };
    expect(toggleSelection([11], 12, true)).toEqual([11, 12]);
    expect(toggleSelection([11, 12], 11, true)).toEqual([12]);
    expect(normalizeSelection([11, 11, 12], [first, otherComp], 1)).toEqual([11]);
    expect(normalizeSelection([11], [first, otherComp], null)).toEqual([]);
  });

  test('moves every selected static layer once and snaps the group to neighboring geometry', () => {
    const a = makeFrame(1, [10, 10], { left: 5, top: 5, right: 15, bottom: 15 });
    const b = makeFrame(2, [40, 10], { left: 35, top: 5, right: 45, bottom: 15 });
    const target = { left: 60, top: 30, right: 80, bottom: 50 };
    const snap = snapTranslation(unionBounds([a.bounds, b.bounds])!, 14, 15, [target], 6);
    expect(snap).toEqual({ dx: 15, dy: 15, guides: { x: 60, y: 30 } });
    expect(moveFrames([a, b], snap.dx, snap.dy)).toEqual([
      { compId: 1, layerId: 1, position: [25, 25] },
      { compId: 1, layerId: 2, position: [55, 25] },
    ]);
  });

  test('snap geometry ignores missing, non-finite, and zero-area targets', () => {
    const moving = { left: 100, top: 100, right: 120, bottom: 120 };
    const invalid = [
      null,
      undefined,
      { left: 120, top: 100, right: 120, bottom: 120 },
      { left: 120, top: 100, right: 130, bottom: 100 },
      { left: Number.NaN, top: 100, right: 130, bottom: 120 },
    ] as const;
    expect(usableSnapRects(invalid)).toEqual([]);
    expect(snapTranslation(moving, 2, 0, invalid, 8)).toEqual({ dx: 2, dy: 0, guides: {} });
  });

  test('resizes around a fixed opposite corner and aligns measured bounds', () => {
    const a = makeFrame(1, [10, 10], { left: 5, top: 5, right: 15, bottom: 15 });
    const b = makeFrame(2, [30, 20], { left: 25, top: 15, right: 35, bottom: 25 });
    const bounds = unionBounds([a.bounds, b.bounds])!;
    const resized = resizeFrames([a, b], bounds, 'se', { x: 80, y: 40 });
    expect(resized).toEqual([
      { compId: 1, layerId: 1, position: [17.5, 13.75], scale: [250, 175] },
      { compId: 1, layerId: 2, position: [67.5, 31.25], scale: [250, 175] },
    ]);
    expect(alignFrames([a, b], 'left')).toEqual([
      { compId: 1, layerId: 1, position: [10, 10] },
      { compId: 1, layerId: 2, position: [10, 20] },
    ]);
  });

  test('rotates selection around aggregate center and snaps to 15 degree increments', () => {
    const a = makeFrame(1, [10, 0], { left: 5, top: -5, right: 15, bottom: 5 });
    const b = makeFrame(2, [0, 10], { left: -5, top: 5, right: 5, bottom: 15 });
    const rotated = rotateFrames([a, b], { x: 0, y: 0 }, 43, 15);
    expect(rotated.map((edit) => edit.rotation)).toEqual([45, 45]);
    expect(rotated[0].position?.[0]).toBeCloseTo(7.0711);
    expect(rotated[0].position?.[1]).toBeCloseTo(7.0711);
    expect(rotated[1].position?.[0]).toBeCloseTo(-7.0711);
    expect(rotated[1].position?.[1]).toBeCloseTo(7.0711);
  });

  test('refuses unsupported parented, animated, 3D, matte, and locked members as a group', () => {
    const plain = makeFrame(1, [0, 0], { left: 0, top: 0, right: 10, bottom: 10 });
    const parented = makeFrame(
      2,
      [10, 0],
      { left: 10, top: 0, right: 20, bottom: 10 },
      { parentId: 9, parentName: 'Parent' },
    );
    const animatedPosition = makeFrame(
      3,
      [10, 0],
      { left: 10, top: 0, right: 20, bottom: 10 },
      { transformLocks: { position: 'Animated position' } },
    );
    const threeDimensional = makeFrame(
      4,
      [10, 0],
      { left: 10, top: 0, right: 20, bottom: 10 },
      { transformLocks: { scale: '3D layer' } },
    );
    const matteLocked = makeFrame(
      5,
      [10, 0],
      { left: 10, top: 0, right: 20, bottom: 10 },
      { transformLocks: { rotation: 'Track matte relationship' } },
    );
    for (const blocked of [parented, animatedPosition]) {
      expect(canvasGestureAllowed([plain, blocked], 'move')).toBe(false);
      expect(moveFrames([plain, blocked], 5, 0)).toEqual([]);
    }
    expect(canvasGestureAllowed([plain, threeDimensional], 'move')).toBe(true);
    expect(canvasGestureAllowed([plain, threeDimensional], 'resize')).toBe(false);
    expect(canvasGestureAllowed([plain, matteLocked], 'rotate')).toBe(false);
    expect(canvasGestureAllowed([plain], 'move')).toBe(true);
  });
});

test('framing selection centers the current measured box, preserves the document and rejects empty geometry', () => {
  const view = { zoom: 1, pan: { x: 0, y: 0 } };
  const box = { left: 350, top: 90, right: 400, bottom: 110 };
  const framed = frameCanvasSelection(view, box, { width: 750, height: 200 });
  expect(framed).toEqual({ zoom: 4, pan: { x: -1125, y: -300 } });
  expect((375 - view.pan.x) * framed!.zoom / view.zoom + framed!.pan.x).toBe(375);
  expect((100 - view.pan.y) * framed!.zoom / view.zoom + framed!.pan.y).toBe(100);
  expect(view).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  expect(frameCanvasSelection(view, { ...box, right: 350 }, { width: 750, height: 200 })).toBeNull();
});


describe('canvas viewport changes', () => {
  test('retains the scene point at the viewport center and its pixel scale', () => {
    const view = { zoom: 2, pan: { x: 20, y: -30 } };
    const before = { width: 400, height: 300, matrix: { a: 2, b: 0, c: 0, d: 2, e: 20, f: -30 } };
    const after = { width: 600, height: 200, matrix: { a: 1, b: 0, c: 0, d: 1, e: 170, f: -30 } };
    const next = retainCanvasViewOnResize(view, before, after)!;
    expect(next.zoom).toBe(4);
    expect(next.pan).toEqual({ x: -180, y: -80 });
    const ratio = next.zoom / view.zoom;
    const scenePoint = { x: 90, y: 90 };
    expect((after.matrix.a * scenePoint.x + after.matrix.e - view.pan.x) * ratio + next.pan.x).toBe(after.width / 2);
    expect((after.matrix.d * scenePoint.y + after.matrix.f - view.pan.y) * ratio + next.pan.y).toBe(after.height / 2);
    expect(after.matrix.a * ratio).toBe(before.matrix.a);
  });

  test('retains the center when maximum zoom constrains a smaller canvas', () => {
    const next = retainCanvasViewOnResize(
      { zoom: 4, pan: { x: 0, y: 0 } },
      { width: 400, height: 300, matrix: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 } },
      { width: 200, height: 100, matrix: { a: .5, b: 0, c: 0, d: .5, e: 0, f: 0 } },
    );
    expect(next).toEqual({ zoom: 4, pan: { x: 50, y: 12.5 } });
  });

  test('ignores hidden, singular or invalid viewport measurements', () => {
    const valid = { width: 400, height: 300, matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } };
    const view = { zoom: 1, pan: { x: 0, y: 0 } };
    expect(retainCanvasViewOnResize(view, valid, { ...valid, height: 0 })).toBeNull();
    expect(retainCanvasViewOnResize(view, { ...valid, matrix: { ...valid.matrix, a: 0 } }, valid)).toBeNull();
    expect(retainCanvasViewOnResize(view, valid, { ...valid, width: Number.NaN })).toBeNull();
  });
});
