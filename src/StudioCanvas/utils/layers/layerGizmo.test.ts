import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import {
  handleCursor,
  handlePoints,
  resizeLayer,
  rotateHandlePoint,
  rotateLayer,
} from './layerGizmo';
import { layerBounds, sourceToComposition } from './layerTransform';

const layer = (patch: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id: 'l',
  name: 'l',
  sourceNodeId: 'n',
  sourceWidth: 400,
  sourceHeight: 200,
  anchor: { x: 200, y: 100 },
  position: { x: 1000, y: 1000 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...patch,
});

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('resizeLayer', () => {
  test('the OPPOSITE handle does not move', () => {
    const start = layer();
    const before = handlePoints(start).nw;
    const after = handlePoints(resizeLayer(start, 'se', { x: 1500, y: 1400 }));
    close(after.nw.x, before.x);
    close(after.nw.y, before.y);
  });

  test('the dragged corner tracks the pointer', () => {
    const resized = resizeLayer(layer(), 'se', { x: 1500, y: 1400 });
    const corner = handlePoints(resized).se;
    close(corner.x, 1500);
    close(corner.y, 1400);
  });

  test('an edge handle changes ONE axis', () => {
    const start = layer();
    const resized = resizeLayer(start, 'e', { x: 1400, y: 9999 });
    close(resized.scale.y, start.scale.y);
    expect(resized.scale.x).toBeGreaterThan(start.scale.x);
    const bounds = layerBounds(resized);
    close(bounds.bottom - bounds.top, 200);
  });

  test('is correct for a ROTATED layer — the pointer is read in the layer axes', () => {
    // Turned a quarter turn, the layer's local +x runs DOWN the screen, so dragging the
    // se handle further down must widen it. Reading raw screen deltas would skew it.
    const start = layer({ rotation: 90 });
    const before = handlePoints(start);
    const resized = resizeLayer(start, 'se', { x: before.se.x, y: before.se.y + 200 });
    close(resized.scale.x, 1.5);
    close(resized.scale.y, 1);
    const after = handlePoints(resized);
    close(after.nw.x, before.nw.x);
    close(after.nw.y, before.nw.y);
  });

  test('dragging past the opposite handle FLIPS the axis, with no flip field', () => {
    const resized = resizeLayer(layer(), 'e', { x: 500, y: 1000 });
    expect(resized.scale.x).toBeLessThan(0);
    expect('flipH' in resized).toBe(false);
  });

  test('lockAspect holds the layer ratio', () => {
    const start = layer({ scale: { x: 1, y: 1 } });
    const free = resizeLayer(start, 'se', { x: 1600, y: 1120 });
    expect(Math.abs(free.scale.x - free.scale.y)).toBeGreaterThan(0.1);

    const locked = resizeLayer(start, 'se', { x: 1600, y: 1120 }, true);
    close(Math.abs(locked.scale.x), Math.abs(locked.scale.y));
    // and the opposite corner still holds
    close(handlePoints(locked).nw.x, handlePoints(start).nw.x);
  });

  test('never collapses to zero — the layer stays grabbable', () => {
    const collapsed = resizeLayer(layer(), 'se', { x: 800, y: 900 });
    expect(Math.abs(collapsed.scale.x)).toBeGreaterThanOrEqual(0.01);
    expect(Math.abs(collapsed.scale.y)).toBeGreaterThanOrEqual(0.01);
  });
});

describe('rotateLayer', () => {
  test('rotates about the ANCHOR, by the pointer DELTA', () => {
    const start = layer();
    // Start due east of the pivot, drag to due south: +90 degrees clockwise.
    const rotated = rotateLayer(start, { x: 1200, y: 1000 }, { x: 1000, y: 1200 });
    close(rotated.rotation, 90);
    // The anchor is untouched, which is the whole point of pivoting on it.
    expect(rotated.position).toEqual(start.position);
    expect(sourceToComposition(rotated, start.anchor)).toEqual(start.position);
  });

  test('grabbing the handle does not snap the layer to the cursor', () => {
    const start = layer({ rotation: 30 });
    const unmoved = rotateLayer(start, { x: 1200, y: 1000 }, { x: 1200, y: 1000 });
    close(unmoved.rotation, 30);
  });

  test('snaps to a step when asked, and stays inside (-180, 180]', () => {
    const snapped = rotateLayer(layer(), { x: 1200, y: 1000 }, { x: 1190, y: 1100 }, 15);
    expect(snapped.rotation % 15).toBe(0);
    const wrapped = rotateLayer(
      layer({ rotation: 170 }),
      { x: 1200, y: 1000 },
      { x: 1000, y: 1200 },
    );
    expect(wrapped.rotation).toBeGreaterThan(-180);
    expect(wrapped.rotation).toBeLessThanOrEqual(180);
  });
});

describe('handle placement', () => {
  test('the eight handles sit on the PLACED box, not the source box', () => {
    const points = handlePoints(layer({ scale: { x: 2, y: 2 } }));
    close(points.nw.x, 600);
    close(points.se.x, 1400);
    close(points.n.x, 1000);
  });

  test('the rotate grip sits outside the top edge, turning with the layer', () => {
    close(rotateHandlePoint(layer(), 40).y, 860);
    // Turned 180 degrees, "above the top edge" is below the layer on screen.
    close(rotateHandlePoint(layer({ rotation: 180 }), 40).y, 1140);
  });

  test('the cursor turns with the layer', () => {
    expect(handleCursor('n', 0)).toBe('ns-resize');
    expect(handleCursor('n', 90)).toBe('ew-resize');
    expect(handleCursor('nw', 0)).toBe('nwse-resize');
  });
});
