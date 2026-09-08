import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import {
  handleCursor,
  handlePoints,
  resizeLayer,
  rotateGroup,
  rotateHandlePoint,
  rotateLayer,
  scaleGroup,
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

describe('resize from the centre (alt)', () => {
  const square = (): LayerEditorLayer => ({
    id: 'l',
    name: 'l',
    sourceNodeId: 'n',
    sourceWidth: 100,
    sourceHeight: 100,
    anchor: { x: 50, y: 50 },
    position: { x: 500, y: 500 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
  });

  test('the CENTRE stays put, so both edges move', () => {
    const start = square();
    // Drag the se handle from (550,550) out to (600,600).
    const next = resizeLayer(start, 'se', { x: 600, y: 600 }, false, true);

    expect(next.position).toEqual({ x: 500, y: 500 });
    expect(next.scale.x).toBeCloseTo(2, 6);
    expect(next.scale.y).toBeCloseTo(2, 6);
  });

  test('FALSIFIER: the default still pins the OPPOSITE handle', () => {
    const start = square();
    const next = resizeLayer(start, 'se', { x: 600, y: 600 }, false, false);

    // nw stays at (450,450), so the centre slides out to (525,525).
    expect(next.position).toEqual({ x: 525, y: 525 });
    expect(next.scale.x).toBeCloseTo(1.5, 6);
  });

  test('holds the centre for an edge handle too', () => {
    const start = square();
    const next = resizeLayer(start, 'e', { x: 600, y: 500 }, false, true);

    expect(next.position.x).toBeCloseTo(500, 6);
    expect(next.scale.x).toBeCloseTo(2, 6);
    // The untouched axis is untouched.
    expect(next.scale.y).toBeCloseTo(1, 6);
  });
});

describe('group transform', () => {
  const at = (id: string, x: number, y: number, over: Partial<LayerEditorLayer> = {}) =>
    ({
      id,
      name: id,
      sourceNodeId: `n-${id}`,
      sourceWidth: 100,
      sourceHeight: 100,
      anchor: { x: 50, y: 50 },
      position: { x, y },
      scale: { x: 1, y: 1 },
      rotation: 0,
      opacity: 1,
      blendMode: 'normal',
      visible: true,
      locked: false,
      ...over,
    }) satisfies LayerEditorLayer;

  // Two 100x100 layers centred at (200,200) and (400,400): union bounds 150..450.
  const pair = () => [at('a', 200, 200), at('b', 400, 400)];
  const bounds = { left: 150, top: 150, right: 450, bottom: 450 };

  test('scaling from a corner holds the opposite corner and scales both members', () => {
    const next = scaleGroup({
      layers: pair(),
      ids: ['a', 'b'],
      handle: 'se',
      // The se corner is (450,450) and nw is fixed at (150,150). Dragging se to (750,750)
      // doubles the 300px span.
      pointer: { x: 750, y: 750 },
      bounds,
    });

    expect(next[0].position).toEqual({ x: 250, y: 250 });
    expect(next[0].scale).toEqual({ x: 2, y: 2 });
    expect(next[1].position).toEqual({ x: 650, y: 650 });
    expect(next[1].scale).toEqual({ x: 2, y: 2 });
  });

  test('the arrangement scales as ONE piece — the gap between members doubles too', () => {
    const next = scaleGroup({
      layers: pair(),
      ids: ['a', 'b'],
      handle: 'se',
      pointer: { x: 750, y: 750 },
      bounds,
    });

    const before = 400 - 200;
    const after = next[1].position.x - next[0].position.x;
    expect(after).toBe(before * 2);
  });

  test('alt holds the group CENTRE instead', () => {
    const next = scaleGroup({
      layers: pair(),
      ids: ['a', 'b'],
      handle: 'se',
      // Centre is (300,300); se is 150 away. Dragging to (600,600) doubles it.
      pointer: { x: 600, y: 600 },
      bounds,
      fromCentre: true,
    });

    // Symmetric about the centre: the two members end up mirrored around (300,300).
    expect(next[0].position).toEqual({ x: 100, y: 100 });
    expect(next[1].position).toEqual({ x: 500, y: 500 });
  });

  test('a locked member is not dragged along', () => {
    const next = scaleGroup({
      layers: [at('a', 200, 200), at('locked', 400, 400, { locked: true })],
      ids: ['a', 'locked'],
      handle: 'se',
      pointer: { x: 750, y: 750 },
      bounds,
    });

    expect(next[1].position).toEqual({ x: 400, y: 400 });
    expect(next[1].scale).toEqual({ x: 1, y: 1 });
  });

  test('rotating the group turns each member AND swings it around the centre', () => {
    const next = rotateGroup({
      layers: pair(),
      ids: ['a', 'b'],
      bounds,
      // Centre (300,300). From due east to due south is +90 degrees.
      startPointer: { x: 400, y: 300 },
      pointer: { x: 300, y: 400 },
    });

    expect(next[0].rotation).toBeCloseTo(90, 6);
    // (200,200) is (-100,-100) from the centre; +90 clockwise sends it to (+100,-100).
    expect(next[0].position.x).toBeCloseTo(400, 6);
    expect(next[0].position.y).toBeCloseTo(200, 6);
  });

  test('FALSIFIER: turning members in place is NOT a group rotation', () => {
    const next = rotateGroup({
      layers: pair(),
      ids: ['a', 'b'],
      bounds,
      startPointer: { x: 400, y: 300 },
      pointer: { x: 300, y: 400 },
    });

    // A version that only wrote `rotation` would leave the anchors untouched. The whole
    // point of a group rotate is that the ARRANGEMENT turns.
    expect(next[0].position).not.toEqual({ x: 200, y: 200 });
    expect(next[1].position).not.toEqual({ x: 400, y: 400 });
  });

  test('group rotation snaps to the nearest multiple with shift', () => {
    const rotated = (y: number) =>
      rotateGroup({
        layers: pair(),
        ids: ['a', 'b'],
        bounds,
        startPointer: { x: 400, y: 300 },
        pointer: { x: 400, y },
        snapDegrees: 15,
      })[0].rotation;

    // atan2(5,100) is 2.9 degrees, which rounds down to nothing...
    expect(rotated(305)).toBe(0);
    // ...and atan2(20,100) is 11.3, which rounds UP to a full step.
    expect(rotated(320)).toBe(15);
  });
});
